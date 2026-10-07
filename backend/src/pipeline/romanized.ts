/**
 * Cheap, offline lexicon hints for ROMANIZED text (Hinglish, Tanglish, …).
 * These are *hints* fed to the LLM and a low-confidence fallback — never the final word.
 * Words that are ambiguous between languages carry smaller weights.
 */

const LEX: Record<string, string> = {
  ta: `nee nii naan naa enga enge iruka irukka irukkiya irukken irupen iruken irukiya enaku enakku unaku unakku
    puriyala puriyudhu purinjidhu polaama polama polam poren varen varuven vaanga vaa poda podi da di machan machi
    ennada enna epdi eppadi eppo naalaiku naala naalaiki inniku indha andha romba konjam seri sari aama illa illai
    venam venum paaru paathen saptiya sapten saapdu saapta ponga vandhuten pesu pesalam sollu sollunga theriyum
    theriyala nalla ennoda unnoda avan aval avanga ingaye angaye eppadi irukinga irukeenga nanri vanakkam
    dei dai ena panra panre pannra pannura panna pannu pannalam ennachu sema mokka kalaai vetti thoonguna thoongu
    vaada vaadi poda kelambu kelambalam vandhu vandhiya varriya vareengala aprm apram appuram nambu nijama`,
  hi: `tum tu aap main mai mein hum hai hain ho hoon tha thi the kya kyun kyu kaise kaisa kaisi kahan kaha kab kal aaj
    nahi nahin mat mujhe mujhko tumhe tumhein mera meri mere tera teri tere apna kuch koi sab bahut bohot thoda
    acha accha theek thik chalo chaloge chalenge karna karo karunga rahunga raha rahi rahe samajh aa gaya gayi
    bhai yaar dost abhi phir fir lekin par aur ya toh to bol bolo batao bata dekho dekh milte milna khana
    kal shaam subah raat ghar kaam paisa`,
  te: `nuvvu nenu meeru manam ekkada unnav unnaru ela enti emi ledu undi avunu kaadu chesav chesanu cheppu cheppandi
    ravali vellipo randi baagunnava baagunnara nijam telusu teliyadu naaku neeku mari kani sare ayite eppudu
    repu ninna ivala bhojanam`,
  kn: `neenu naanu nanu elli idiya hegidiya hegiddira yenu enu illa beku gottilla gottu maadi maadu hogona banni
    baa hogi saaku channagide chennagide ivattu naale nale ninne yaake yaavaga`,
  ml: `njan ente ninte nee evideya evide entha enthaa sheri shari alle aanu aano illa undo pova varam vaa chetta chechi
    machane kazhicho kazhinju parayu ariyilla manassilayi nale innale innu enthokke ningal`,
  bn: `ami tumi apni kemon achho acho achen kothay kothaye bhalo bhalo-i nai ki korcho korchi amar tomar tor kal ekhon
    pore keno kintu ar ei oi khabo jabo ashbo hobe dekha bujhte`,
  mr: `mi tu tumhi kasa kashi kase ahes ahe aahe aahes kay nahi mala tula tumhala kuthe kadhi udya aaj kaal ata
    mhanje pan ani kar kara bagh jevlas jevlis zala zhale`,
  gu: `kem cho chho su shu che tame hu mane tane mari tamari kyare kya kem-cho nathi ane pan aaje kaale jamyo`,
  pa: `tusi tussi kiddan kidda ki haan nahi menu tenu tuhanu kithe kado ajj kal assi mainu tera mera chal pai
    veere yaar kithon`,
  ur: `aap ap tum main mein hai hain kya kyun kaise nahi nahin mujhe janab shukriya khuda hafiz inshallah mashallah
    bohat bahut zaroor kal aaj`,
  ne: `timi tapai ma ho hoina chha chhaina kasto cha ke kaha kahaan mero timro hajur dhanyabad namaste bholi aaja`,
  si: `oyaa mama kohomada koheda eka nene ow ne mokada karanna yanna enna ayubowan sthuthi`,
  ar: `ana enta enti keefak kifak shukran habibi yalla inshallah mashallah mafi mish aywa la3 3arabi marhaba`,
  ja: `watashi anata genki arigatou konnichiwa sayonara hai iie sumimasen daijoubu kawaii nani doko itsu`,
  ko: `annyeong saranghae gamsahamnida ne aniyo mwo eodi waeyo juseyo`,
};

// Words shared across Indic languages count for less.
const AMBIGUOUS = new Set([
  'nee','nii','naa','da','di','illa','ki','kya','nahi','nahin','tu','mi','ma','aap','ap','tum','main','mein','hai',
  'hain','kal','aaj','ar','ho','to','toh','ane','pan','ani','kem','su','che','ae','ei','oi','yaar','ne','hai','ka',
  'mat','par','aur','ya','chal','kar','kara','karo',
]);

const ENGLISH = new Set(
  `the a an is are was were be been am i you he she it we they me my your his her our their this that these those
    and or but if then so because to of in on at for with from by about as into like can could will would shall
    should do does did have has had not no yes ok okay please thanks thank hello hi hey what when where why how who
    which there here just really very too also more some any all one two now today tomorrow tonight morning evening
    free busy going come coming meet call text lol bro dude`.split(/\s+/),
);

const INDEX = new Map<string, Set<string>>();
for (const [code, words] of Object.entries(LEX)) {
  for (const w of words.split(/\s+/).filter(Boolean)) {
    if (!INDEX.has(w)) INDEX.set(w, new Set());
    INDEX.get(w)!.add(code);
  }
}

export interface RomanizedHint {
  candidates: Array<{ code: string; score: number }>;
  englishRatio: number;
  tokenCount: number;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}'\-\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function romanizedHints(text: string): RomanizedHint {
  const tokens = tokenize(text);
  const scores = new Map<string, number>();
  let english = 0;
  for (const t of tokens) {
    if (ENGLISH.has(t)) english++;
    const langs = INDEX.get(t);
    if (!langs) continue;
    // weight: specific word split across the languages that share it
    const base = AMBIGUOUS.has(t) ? 0.4 : 1;
    for (const code of langs) scores.set(code, (scores.get(code) ?? 0) + base / langs.size ** 0.5);
  }
  const n = Math.max(tokens.length, 1);
  const candidates = [...scores.entries()]
    .map(([code, s]) => ({ code, score: Math.min(1, s / Math.max(2, n * 0.5)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return { candidates, englishRatio: english / n, tokenCount: tokens.length };
}
