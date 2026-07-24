/**
 * The seed corpus — realistic citizen complaints for Gazipur City Corporation.
 *
 * Written to exercise the two claims the demo rests on:
 *  1. CROSS-LINGUAL DEDUPE — the big clusters below are the SAME physical problem
 *     described in Bangla, English and phonetic Banglish. The pipeline must
 *     collapse each cluster into one issue with a high reportCount.
 *  2. A POPULATED, RANKED MAP — enough distinct singletons across wards that the
 *     dashboard map and work queue look like a real city's morning, not a toy.
 *
 * These are inputs only. Every field the app uses (category, severity, summaries,
 * dispatch brief) is produced by running this through the REAL Gemma pipeline in
 * seed.js — never hand-authored, per the "no faked AI output" rule (CLAUDE.md §1).
 *
 * `at` is [lng, lat]. seed.js applies ~40 m jitter, so cluster members land
 * inside the 150 m dedupe radius while singletons stay well outside it.
 */

// Approximate ward/landmark centres in Gazipur City Corporation.
const L = {
  tongiBazar: [90.4012, 23.8918],
  konabari: [90.3702, 23.9705],
  boardBazar: [90.3989, 23.9412],
  chandana: [90.4155, 23.9321],
  shibbari: [90.4201, 23.9105],
  joydebpur: [90.4203, 23.9999],
  gazipura: [90.4050, 23.8830],
  salna: [90.4350, 23.9600],
  vogra: [90.4090, 23.9550],
  cheragAli: [90.4000, 23.8990],
  tongiStation: [90.3980, 23.8930],
  ershadNagar: [90.3950, 23.8880],
  mouchak: [90.2600, 24.0400],
  rajendrapur: [90.4300, 24.0700],
  zirani: [90.2900, 23.9200],
  collegeGate: [90.4030, 23.8950],
};

export const CORPUS = [
  /* --- CLUSTER 1: one sparking transformer at Tongi Bazar (10 reports) ------
   * Bangla, English and Banglish, all describing the same hazard. This is the
   * "40 citizens, one ticket" demo beat in miniature. */
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'টঙ্গী বাজারের সামনে বিদ্যুতের ট্রান্সফরমার থেকে আগুনের ফুলকি বের হচ্ছে, খুব বিপজ্জনক' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'Transformer sparking badly at Tongi Bazar, people are scared to walk past it' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'tongi bazar er transformer theke ekhono spark hocche, keu ase nai ekhono' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'ট্রান্সফরমারে আগুন লেগে যেতে পারে, টঙ্গী বাজার মোড়, দ্রুত ব্যবস্থা নিন' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'There is a burning smell and sparks from the electric transformer near Tongi market' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'টঙ্গী বাজারের বিদ্যুতের খুঁটিতে শর্ট সার্কিট হচ্ছে, স্ফুলিঙ্গ ছিটকে পড়ছে' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'vai tongi bazar er samne electric spark hocche, bacchara ei rasta diye school e jay' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'বিদ্যুতের তার থেকে স্ফুলিঙ্গ বের হচ্ছে, টঙ্গী বাজার, এখনই লোক পাঠান' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'Sparks flying from the transformer at Tongi bazar for the last two hours now' },
  { cluster: 'tongi-transformer', at: L.tongiBazar, text: 'টঙ্গী বাজারে ট্রান্সফরমার থেকে ধোঁয়া আর ফুলকি, আশেপাশে দোকানপাট বন্ধ করে দিয়েছে' },

  /* --- CLUSTER 2: flooded road at Konabari (6 reports) --------------------- */
  { cluster: 'konabari-flood', at: L.konabari, text: 'কোনাবাড়ীতে রাস্তা পুরো পানির নিচে, রিকশা চলতে পারছে না' },
  { cluster: 'konabari-flood', at: L.konabari, text: 'Konabari main road is flooded again, water is knee deep near the factory gate' },
  { cluster: 'konabari-flood', at: L.konabari, text: 'konabari te rasta bondho, pani jome ache, garmenter meyera jaite parche na' },
  { cluster: 'konabari-flood', at: L.konabari, text: 'কোনাবাড়ী মেইন রোডে হাঁটু পানি, শ্রমিকরা কারখানায় যেতে পারছে না সকাল থেকে' },
  { cluster: 'konabari-flood', at: L.konabari, text: 'Waterlogging on Konabari road since morning, buses and trucks are all stuck' },
  { cluster: 'konabari-flood', at: L.konabari, text: 'কোনাবাড়ীতে জলাবদ্ধতা, নোংরা পানি এখন বাড়ির ভেতরে ঢুকছে' },

  /* --- CLUSTER 3: uncollected garbage at Board Bazar (4 reports) ----------- */
  { cluster: 'boardbazar-garbage', at: L.boardBazar, text: 'ময়লার স্তূপ জমে আছে বোর্ড বাজারের পাশে, দুর্গন্ধে টেকা যায় না' },
  { cluster: 'boardbazar-garbage', at: L.boardBazar, text: 'Huge garbage pile at Board Bazar, it has not been collected for over a week' },
  { cluster: 'boardbazar-garbage', at: L.boardBazar, text: 'board bazar er pashe ময়লা পচে ভয়ানক গন্ধ ছড়াচ্ছে, mosha barche' },
  { cluster: 'boardbazar-garbage', at: L.boardBazar, text: 'বোর্ড বাজারে আবর্জনার স্তূপ থেকে মাছি আর মশা ছড়াচ্ছে, রোগের ভয়' },

  /* --- CLUSTER 4: dead streetlight at Chandana Chowrasta (3 reports) ------- */
  { cluster: 'chandana-streetlight', at: L.chandana, text: 'Chandana intersection street light has been off for two weeks now' },
  { cluster: 'chandana-streetlight', at: L.chandana, text: 'চান্দনা চৌরাস্তায় রাতে ঘুটঘুটে অন্ধকার, স্ট্রিট লাইট নষ্ট হয়ে আছে' },
  { cluster: 'chandana-streetlight', at: L.chandana, text: 'chandana mor e street light jole na, raate onek ondhokar, chintai lage' },

  /* --- CLUSTER 5: missing drain cover at Shibbari Road (3 reports) --------- */
  { cluster: 'shibbari-drain', at: L.shibbari, text: 'Drain cover missing near Shibbari Road, a child could easily fall in' },
  { cluster: 'shibbari-drain', at: L.shibbari, text: 'শিববাড়ী রোডে ড্রেনের ঢাকনা নেই, রাতের বেলা বড় বিপদ হতে পারে' },
  { cluster: 'shibbari-drain', at: L.shibbari, text: 'shibbari road e drain er dhakna churi hoye gese, khola drain, bipdojonok' },

  /* --- SINGLETONS: distinct problems across the corporation --------------- */
  { cluster: 'single', at: L.joydebpur, text: 'জয়দেবপুর রেলগেটের কাছে সড়কে বড় গর্ত, প্রায়ই দুর্ঘটনা ঘটছে' },
  { cluster: 'single', at: L.gazipura, text: 'গাজীপুরা এলাকায় তিন দিন ধরে পানি নেই, WASA কে বার বার বলেও কাজ হয়নি' },
  { cluster: 'single', at: L.salna, text: 'salna bazar er kache sewage line uthe gese, nongra pani rasta bhore gese' },
  { cluster: 'single', at: L.vogra, text: 'ভোগড়া মোড়ে ফুটপাত ভাঙা, পথচারীরা বাধ্য হয়ে মূল রাস্তায় নামছে' },
  { cluster: 'single', at: L.cheragAli, text: 'Cherag Ali te gas er kotha gondho paoa jacche, gas line leak hote pare' },
  { cluster: 'single', at: L.mouchak, text: 'মৌচাকে খোলা ম্যানহোল পড়ে আছে, রাতে কেউ পড়ে গিয়ে মারা যেতে পারে' },
  { cluster: 'single', at: L.collegeGate, text: 'college gate signal batti kaj korche na, sara din e jam legei thake' },
  { cluster: 'single', at: L.ershadNagar, text: 'এরশাদ নগরে পানির মূল পাইপ ফেটে রাস্তায় প্রচুর পানি অপচয় হচ্ছে' },
  { cluster: 'single', at: L.rajendrapur, text: 'Rajendrapur e boro gach rastar upor bhenge porese, jatayat puro bondho' },
  { cluster: 'single', at: L.tongiStation, text: 'স্টেশন রোডে জমে থাকা পানিতে মশার বংশবিস্তার হচ্ছে, ডেঙ্গুর আশঙ্কা' },
  { cluster: 'single', at: L.zirani, text: 'zirani bazar er kache rastar bati nosto, sondhyar por khub bipod hoy' },
  { cluster: 'single', at: L.boardBazar, text: 'বোর্ড বাজার ওভারব্রিজের সিঁড়ি ভাঙা, বয়স্ক মানুষ উঠতে পারছে না' },
];
