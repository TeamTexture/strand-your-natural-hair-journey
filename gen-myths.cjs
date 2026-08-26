const fs = require('fs');
const path = require('path');

const CSS = `
:root{--sand:#F2E8D9;--card:#FDF8F2;--ink:#2C2416;--muted:#7A6A54;--gold:#C49A3C;
  --gold-deep:#A97F28;--line:rgba(92,58,30,.14);--display:'Playfair Display',Georgia,serif;
  --body:'Jost',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--sand);color:var(--ink);font-family:var(--body);line-height:1.6;
  -webkit-font-smoothing:antialiased}
a{color:var(--gold-deep)}
.bar{border-bottom:1px solid var(--line);background:rgba(242,232,217,.94);
  position:sticky;top:0;backdrop-filter:blur(14px);z-index:10}
.bar div{max-width:820px;margin:0 auto;padding:15px 22px;display:flex;align-items:center;gap:14px}
.bar a.logo{font-family:var(--display);font-weight:600;font-size:14px;letter-spacing:.28em;
  color:var(--ink);text-decoration:none}
.bar a.join{margin-left:auto;background:var(--gold);color:#fff;text-decoration:none;
  font-size:12.5px;padding:8px 16px;border-radius:6px}
main{max-width:720px;margin:0 auto;padding:38px 22px 76px}
.crumb{font-size:12px;color:var(--muted);margin-bottom:20px}
.crumb a{text-decoration:none}
.tag{display:inline-block;font-size:9.5px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;background:rgba(196,154,60,.16);color:var(--gold-deep);
  padding:4px 9px;border-radius:99px;margin-bottom:15px}
h1{font-family:var(--display);font-size:clamp(1.7rem,5vw,2.5rem);font-weight:600;
  line-height:1.12;margin-bottom:20px}
.answer{border-left:2px solid var(--gold);padding:3px 0 3px 17px;margin-bottom:26px}
.answer p{font-size:1.08rem;line-height:1.62}
.body p{color:var(--muted);margin-bottom:15px;font-size:1rem;line-height:1.72}
.src{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);
  font-size:.82rem;color:var(--muted);line-height:1.55}
.src b{color:var(--ink);font-weight:600}
.cta{margin-top:34px;background:var(--card);border:1px solid var(--line);
  border-radius:14px;padding:24px}
.cta h2{font-family:var(--display);font-size:1.25rem;font-weight:600;margin-bottom:9px}
.cta p{font-size:.95rem;color:var(--muted);margin-bottom:16px;line-height:1.65}
.cta a{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;
  font-size:.95rem;padding:13px 26px;border-radius:6px}
.nx{margin-top:30px;padding-top:22px;border-top:1px solid var(--line)}
.nx h2{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold-deep);margin-bottom:13px}
.nx ul{list-style:none;display:grid;gap:9px}
.nx a{text-decoration:none;font-size:.95rem}
.nx a:hover{text-decoration:underline}
.idx{list-style:none;display:grid;gap:0;border-top:1px solid var(--line)}
.idx li{border-bottom:1px solid var(--line)}
.idx a{display:block;padding:15px 0;text-decoration:none;color:var(--ink);font-size:1rem;
  font-weight:500}
.idx a:hover{color:var(--gold-deep)}
.idx span{display:block;font-size:.87rem;color:var(--muted);font-weight:400;
  margin-top:4px;line-height:1.55}
.grp{font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold-deep);margin:30px 0 4px}
.lede{color:var(--muted);font-size:1.05rem;margin-bottom:8px;line-height:1.68}
`;

const MYTHS = [
{slug:"does-afro-hair-grow",cat:"Growth and length",q:"Does Afro hair grow?",
 a:"Yes. Afro hair grows from the scalp every day, exactly like every other hair type. The belief that it doesn't is one of the most persistent in the community, and it isn't true. What most people are actually struggling with is length retention — keeping the hair once it has grown.",
 body:["Unless a medical professional has told you otherwise, your hair is growing right now. Growth happens at the follicle, beneath the scalp, and it does not stop because of your curl pattern.",
"The reason Afro hair can appear to stay the same length for years is that the ends are breaking off at roughly the same rate as new growth arrives. Tighter curl patterns have more bends along each strand, and every bend is a potential weak point, so the ends are more vulnerable to mechanical damage than straighter hair.",
"Everyone has a genetic terminal length — the maximum their hair can reach. The problem is that most people never get close enough to theirs to find out what it is, because breakage caps them well below it. Length retention, not growth stimulation, is where the results are."],ch:"Chapter 16"},
{slug:"do-oils-moisturise-hair",cat:"Moisture",q:"Do oils moisturise hair?",
 a:"No. Water is the only substance that can moisturise a hair strand. Oils soften, coat, seal and slow the rate at which water leaves the hair — which is useful, but it is a different job. An oil applied to dry hair has no moisture to seal in.",
 body:["This is probably the single most costly misunderstanding in Afro hair care, because it sends people to the wrong products for years. Moisture means water content inside the strand. Oils and butters are occlusives: they sit on the outside and slow evaporation.",
"The practical consequence is order of operations. Oil applied over genuinely damp hair slows water loss and does its job. The same oil applied to hair that has been dry for four days seals nothing — it just adds weight and gives the illusion of softness.",
"Product labelling makes this harder than it needs to be. 'Moisturising' appears on bottles containing no water at all, because the word is used as a marketing descriptor rather than a technical claim. Read the ingredients list instead: if water is not near the top, the product is not delivering moisture."],ch:"Chapter 14"},
{slug:"do-hair-growth-oils-work",cat:"Growth and length",q:"Do hair growth oils actually work?",
 a:"Almost never. For a product to stimulate growth it has to reach the follicle deep in the dermis, below the scalp surface. Most oils cannot get there. Topical products do not directly influence growth rate unless they contain a medicinal active ingredient.",
 body:["Hair growth begins at the follicle, a small organ sitting in the middle layer of the scalp. A product applied to the surface of the skin has to penetrate to that depth to affect the rate at which hair is produced. Cosmetic oils are not formulated to do that, and most simply cannot.",
"What a scalp oil can legitimately do is help a dry or irritated scalp feel more comfortable, and reduce friction during styling. Those are real benefits. They are not the same as growing hair faster, and a more comfortable scalp is often what people are experiencing when they report a growth oil 'working'.",
"The exception is products containing proven medicinal actives, which are regulated differently and work through a pharmacological mechanism. If a bottle is making a growth claim without one, treat the claim as marketing.",
"Be especially careful with raw essential oils. Rosemary oil in particular has been heavily promoted, and applying it undiluted directly to the scalp can cause genuine skin damage."],ch:"Chapters 11 and 12"},
{slug:"can-co-wash-replace-shampoo",cat:"Wash day",q:"Can co-washing replace shampoo?",
 a:"No. Co-washing conditions but it does not cleanse. Proper cleansing needs a surfactant strong enough to surround dirt particles so they can be dispersed into water and rinsed away. Without one, you are moving debris around your hair rather than removing it.",
 body:["Co-washing became popular around 2010, largely as a reaction to how harshly drying traditional shampoos were. The reaction was understandable. The conclusion — that conditioner can do the cleansing job — was not.",
"Cleansing is a chemical process, not just a mechanical one. Some dirt is dislodged by the friction of your hands moving through your hair, but the rest needs a surfactant molecule to surround it and carry it into the water. A conditioning product with no surfactant redistributes the dirt instead of lifting it out.",
"There is a legitimate place for co-washing between wash days, particularly in hot climates where hair dries out fast. It is a supplement, not a substitute. Skipping shampoo long-term leaves build-up on the strands and blocked follicles on the scalp — which then causes the dryness people blame on shampoo in the first place."],ch:"Chapter 13"},
{slug:"is-porosity-important",cat:"Hair characteristics",q:"Do I need to know my hair porosity?",
 a:"Less than the internet suggests. Porosity has been badly overhyped, and it matters far less for everyday styling than people are led to believe. Most hair sits somewhere in the middle of the scale rather than firmly at one end.",
 body:["Porosity describes how readily your cuticle lets water into the strand. It is genuinely useful information for chemical services like colour. For deciding which conditioner to buy on a Tuesday, it is nowhere near as decisive as it is made out to be.",
"Two corrections matter more than knowing your number. First, most high-porosity hair is made, not born — it is usually the result of fine strands with a thinner protective layer, or of over-manipulation, neglect, heat or chemical processing that has compromised the cuticle.",
"Second, a great many people who believe they have low-porosity hair simply have product build-up. A coated strand repels water in exactly the way low porosity does. Cleanse thoroughly with a strong enough shampoo and the water absorbs normally — which tells you the porosity was never the problem.",
"The idea that you are definitively high or low is itself a misconception. If you want it assessed properly, a curl specialist can do it in person."],ch:"Chapter 8"},
{slug:"are-silicones-bad-for-afro-hair",cat:"Ingredients",q:"Are silicones bad for Afro hair?",
 a:"No. Silicones have been written off by much of the natural hair community, but they are emollients and they can be genuinely excellent for very dry or porous hair that mats and tangles easily. The real requirement is cleansing them off properly.",
 body:["Silicones reduce friction between strands, which is exactly what hair prone to tangling and matting needs. They also shield the hair from heat, which delays split-end formation and reduces styling damage. For someone whose main problem is breakage during detangling, that is a meaningful benefit.",
"The legitimate concern is build-up. Silicones are difficult to remove, and if you use them without cleansing adequately they accumulate on the strands and the scalp, blocking follicles and preventing water from getting in. That is where the bad reputation came from.",
"So the rule is conditional rather than absolute: if you use silicones, commit to a proper wash day with a shampoo strong enough to clear them. Avoiding an entire ingredient category outright means avoiding a tool that might be the one that stops your hair snapping."],ch:"Chapter 15"},
{slug:"are-parabens-dangerous",cat:"Ingredients",q:"Are parabens dangerous in hair products?",
 a:"No, not at the concentrations used in cosmetics. Parabens have been officially assessed as safe at formulation levels. The studies that triggered the hormone-disruption concern involved rats fed enormous quantities, far beyond any realistic exposure from a hair product.",
 body:["Parabens are preservatives. Their job is to stop products growing bacteria and mould, which is a real safety function and not a cosmetic nicety.",
"The hormonal-disruption worry traces back to research using doses wildly out of proportion to how these ingredients are actually used. Regulatory assessment of the concentrations that appear in cosmetics has found them safe.",
"This matters practically, because 'paraben-free' has become a selling point and some reformulations swap in weaker alternatives. Ingredients like sorbic acid or rosemary extract sound reassuring but are not broad-spectrum preservatives — rosemary extract helps stop oils going rancid, and citric acid adjusts pH, but neither gives full microbial protection alone. A poorly preserved product is a genuine risk in a way that a paraben is not."],ch:"Chapter 15"},
{slug:"is-natural-always-safer",cat:"Ingredients",q:"Is 'natural' always safer for hair?",
 a:"No. Plant-derived does not mean risk-free. Natural ingredients can still cause skin irritation and allergic reactions, particularly when a product has not been formulated correctly, and a few are actively unsafe applied raw to the scalp. Rosemary oil is the clearest current example.",
 body:["'Natural' is a marketing category, not a safety classification. Nothing about a plant origin exempts an ingredient from causing contact dermatitis or an allergic response.",
"Rosemary oil is the clearest current example. It has been promoted hard on social media, and applying it undiluted directly to the scalp can cause serious skin damage. Essential oils are concentrated compounds and need proper dilution.",
"Ingredient lists can also be gamed. Under EU rules, once ingredients drop below one per cent of the formula they can be listed in any order — so a brand can position natural-sounding ingredients high up and push fragrances or preservatives down to make a formula look cleaner than it is. US brands do not always follow the same rules at all.",
"If an ingredient is unfamiliar, look it up in a reputable cosmetics ingredient database rather than taking the front of the bottle at face value."],ch:"Chapter 15"},
{slug:"does-curl-type-matter",cat:"Hair characteristics",q:"Does knowing my curl type help me care for my hair?",
 a:"Not much. The curl typing chart was created in 1998 as a marketing tool for a product line, not as a scientific framework. It describes what hair looks like, not how it behaves — and behaviour is what determines how you should care for it.",
 body:["The chart came out of a hair care brand launch in 1998, built to help consumers pick products from that range. It spread because it was simple, and because major beauty brands adopted it in their research and campaigns. Simplicity was its appeal and also its limit.",
"The problem is that curl pattern is only one characteristic among several, and it is the one that predicts the least. Two people with visually near-identical curls can have completely different strand diameter, density, porosity and elasticity — and those are the properties that decide what a product will actually do on their hair.",
"The characteristics worth knowing are strand diameter, surface texture, curl diameter, density, porosity and elasticity, plus the condition of your scalp. Some are easy to judge yourself; porosity and elasticity are the two most people find hardest, and a curl specialist can confirm those if you want them checked.",
"Curl pattern is not useless. It is just a description of appearance, and it was never designed to carry the weight the community has put on it."],ch:"Chapter 8"},
{slug:"should-i-grease-my-scalp",cat:"Scalp health",q:"Should I grease my scalp?",
 a:"Generally no. Regularly greasing and oiling the scalp can signal to your sebaceous glands that they are not needed, and they respond by producing less sebum. You end up dependent on the product for the job your scalp used to do itself.",
 body:["Scalp greasing is one of the most deeply inherited practices in Afro hair care, passed down through generations with real love behind it. That does not make it good for the scalp.",
"Your sebaceous glands produce sebum, your own natural conditioning oil. When you consistently take over that role with heavy products, the glands downregulate. The dryness that follows then seems to prove the grease was necessary.",
"There is a second problem. Hair follicles are pores — small openings in the skin — and heavy products block them. A blocked follicle makes it physically harder for your body to push a new hair strand through, which works directly against the length you are trying to keep.",
"A dry scalp is worth treating. It is worth treating with regular cleansing and appropriate products, not with a standing habit of greasing."],ch:"Chapter 12"},
{slug:"can-you-overdo-protein",cat:"Treatments",q:"Can you use too much protein on your hair?",
 a:"Yes, and it is a common cause of breakage. Protein makes hair stronger and less flexible. Applied to hair that is already strong, it removes the give the strand needs to survive being twisted, coiled or brushed, and it snaps instead of bending.",
 body:["Think of a suspension bridge. It has to flex — sway in wind, shift with the ground, absorb traffic. Build it with no capacity to move and the first real stress cracks it. Hair works the same way: strength without elasticity is brittleness.",
"This is why protein treatments should never sit on a fixed schedule. They are corrective, used when the hair's condition calls for them, not maintenance applied monthly because the calendar says so. Routine protein on healthy hair reliably produces the breakage it was meant to prevent.",
"If you are not certain your hair needs protein, that uncertainty is the answer — get it assessed by a professional rather than guessing. Elasticity is the thing being measured, and it is hard to judge accurately on your own hair."],ch:"Chapter 17"},
{slug:"is-shedding-on-wash-day-normal",cat:"Wash day",q:"Is it normal to lose lots of hair on wash day?",
 a:"Usually, yes. Everyone sheds roughly 50 to 100 strands a day, sometimes more. If you wash weekly, that means up to 700 shed strands have been held in your curls waiting to come out — so wash day looks alarming when it is simply arithmetic.",
 body:["Shed hair does not fall out of tightly curled hair the way it does out of straight hair. It stays caught in the surrounding strands until something removes it, which is usually detangling and washing. The volume you see in your hands is a week's accumulation, not that day's loss.",
"Knowing the number in advance matters, because panic leads to worse decisions — washing less often, detangling more roughly, or abandoning a routine that was working.",
"There is a real line, though. Losing hair in clumps, rather than as accumulated individual strands, is not the same thing and should be assessed by a dermatologist promptly. Sudden increases in shedding can also point to scalp issues, styling practices or an underlying health problem worth investigating.",
"Detangling technique is what turns normal shedding into avoidable loss. A great deal of hair is broken by skipping the step, or by doing it too aggressively."],ch:"Chapter 13"},
{slug:"are-protective-styles-always-protective",cat:"Styling",q:"Are protective styles always protective?",
 a:"No. A style is only protective if it distributes tension evenly. Plenty of styles that carry the label create high-tension points across the scalp, and adding extra hair to braids or cornrows loads additional weight onto follicles that have to carry it for weeks.",
 body:["The category name does a lot of unearned work. Protective styling is meant to reduce daily manipulation of your ends, which is a sound principle. Whether a specific install achieves it depends entirely on how it was done.",
"Tension is the variable to watch. Uneven tension concentrates strain on particular sections of the scalp, and sustained traction on follicles is a recognised route to hair loss. Added hair compounds it, because the weight is borne by your own strands and scalp.",
"Duration matters as much as installation. A style left in too long accumulates build-up at the scalp and keeps tension on the same points for weeks at a stretch.",
"Low-manipulation styling is worth building a routine around. It is worth building around styles you can actually wear without pain, and rotating them so the same areas are not always under load."],ch:"Chapter 11"},
{slug:"do-bond-building-shampoos-work",cat:"Treatments",q:"Do bond-building shampoos actually rebuild bonds?",
 a:"Unlikely. Your bonds sit deep in the cortex of the strand. A shampoo, conditioner or cream is not reaching that depth, so while it may condition the surface pleasantly, it is not rebuilding structural bonds in the way the marketing implies.",
 body:["Bond treatments have a real and valuable use: as a preventative measure alongside chemical services that penetrate the cortex, such as colour. That is the context they were developed for and where they earn their reputation.",
"The problem is category creep. Once 'bond building' became a selling point, it appeared on product types that cannot physically do the job. Depth of penetration is the constraint, and a rinse-out product does not overcome it.",
"Genuine bond repair generally means salon-grade treatment, used with a professional, particularly during chemical processing. If you are colouring your hair, that is when these treatments are worth paying for.",
"Surface conditioning is not worthless — it makes hair easier to handle, which reduces breakage. It is just not the same claim."],ch:"Chapter 17"},
{slug:"does-hair-feeling-soft-mean-moisturised",cat:"Moisture",q:"If my hair feels soft, is it moisturised?",
 a:"No. How hair feels is not a reliable measure of its water content. Products form a film over the strand that changes how it feels to the touch without adding moisture inside it. Softness can mean lubricated or coated rather than hydrated.",
 body:["'Moisturised' gets used to describe a sensation, and sensation is subjective. Hair that feels soft, pliable or slippery may simply be coated in emollients that have altered its surface friction.",
"A more honest test is behaviour. Genuinely hydrated hair moves differently, has better elasticity, is easier to style, and holds a style longer. Those are observable over days, not judged by running a hand over your hair after applying a cream.",
"The reason this matters is that water evaporates regardless of what you put on top of it. No quantity of oil or butter prevents that indefinitely — which is why layering more product on day five does not restore what has already gone. It just adds weight and risks clogging follicles.",
"The fix is not a better sealing product. It is a consistent wash day, because that is when water actually gets back into the strand."],ch:"Chapter 14"},
{slug:"how-often-should-i-wash-afro-hair",cat:"Wash day",q:"How often should I wash Afro hair?",
 a:"More often than most people think. Weekly is a good target, and every ten days is the outer limit — two weeks at the absolute latest if your lifestyle genuinely does not allow it. Washing is how water gets back into the strand.",
 body:["The instinct to stretch wash days comes from the belief that washing dries hair out. What actually dries hair out is water leaving it and not being replaced, plus build-up preventing water getting back in.",
"Water evaporates on a timeline you cannot negotiate with. The hydration in your hair after a Sunday morning wash is not still there on Friday, in the same way the water you drank at nine in the morning does not quench your thirst at two in the afternoon. Wash day is the resupply.",
"There is a scalp argument too. Follicles are pores, and product accumulating over two or three weeks blocks them, making it harder for new hair to push through.",
"Detangling properly before and during the wash is what makes a regular schedule sustainable. Done gently and thoroughly, frequent washing does not cost you hair — skipping it does."],ch:"Chapters 13 and 14"}
];

const BASE = 'https://mystrand.co.uk';
const OUT = path.join('public', 'myths');
fs.mkdirSync(OUT, { recursive: true });

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">'
 + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
 + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600'
 + '&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">';

const esc = s => String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>')
  .replace(/"/g,'"').replace(/'/g,'&#x27;');

const bar = () => '<header class="bar"><div><a class="logo" href="' + BASE + '/">STRAND</a>'
  + '<a class="join" href="' + BASE + '/auth">Join the app</a></div></header>';

function shell(title, desc, canon, schema, inner) {
  return '<!DOCTYPE html>\n<html lang="en-GB">\n<head>\n<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(desc) + '">\n'
    + '<link rel="canonical" href="' + canon + '">\n'
    + '<meta property="og:type" content="article">\n'
    + '<meta property="og:title" content="' + esc(title) + '">\n'
    + '<meta property="og:description" content="' + esc(desc) + '">\n'
    + '<meta property="og:url" content="' + canon + '">\n'
    + '<meta name="twitter:card" content="summary">\n'
    + '<meta name="theme-color" content="#F2E8D9">\n' + FONTS + '\n<style>' + CSS + '</style>\n'
    + '<script type="application/ld+json">\n' + JSON.stringify(schema, null, 2) + '\n</scr'+'ipt>\n</head>\n<body>\n'
    + bar() + '\n' + inner + '\n</body>\n</html>\n';
}

const byCat = {};
MYTHS.forEach(x => { (byCat[x.cat] = byCat[x.cat] || []).push(x); });

MYTHS.forEach(x => {
  const url = BASE + '/myths/' + x.slug;
  let sibs = byCat[x.cat].filter(y => y.slug !== x.slug).slice(0, 3);
  if (sibs.length < 3) {
    for (const y of MYTHS) {
      if (y.slug !== x.slug && !sibs.find(s => s.slug === y.slug) && sibs.length < 3) sibs.push(y);
    }
  }
  const nx = sibs.map(y => '<li><a href="' + y.slug + '.html">' + esc(y.q) + '</a></li>').join('');
  const bodyHtml = x.body.map(pp => '<p>' + esc(pp) + '</p>').join('');
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type':'Article', '@id': url + '#article', headline: x.q, url: url, description: x.a,
      inLanguage: 'en-GB', articleSection: x.cat,
      author: { '@type':'Person', name:'Paige Lewin', url: BASE + '/' },
      publisher: { '@type':'Organization', name:'STRAND', url: BASE + '/' },
      citation: { '@type':'Book', name:'How To Love Your Afro',
        author:{ '@type':'Person', name:'Paige Lewin' },
        publisher:{ '@type':'Organization', name:'Bloomsbury' }, datePublished:'2025' },
      isPartOf: { '@id': BASE + '/myths/#collection' },
      about: { '@type':'Thing', name:'Afro and textured hair care' } },
    { '@type':'FAQPage', '@id': url + '#faq', mainEntity: [
      { '@type':'Question', name: x.q, acceptedAnswer:{ '@type':'Answer', text: x.a } } ] },
    { '@type':'BreadcrumbList', itemListElement: [
      { '@type':'ListItem', position:1, name:'STRAND', item: BASE + '/' },
      { '@type':'ListItem', position:2, name:'Myths', item: BASE + '/myths/' },
      { '@type':'ListItem', position:3, name: x.q } ] } ] };
  const inner = '<main>\n<p class="crumb"><a href="' + BASE + '/">STRAND</a> &rsaquo; <a href="index.html">Myths</a>'
    + ' &rsaquo; ' + esc(x.cat) + '</p>\n<span class="tag">Myth</span>\n<h1>' + esc(x.q) + '</h1>\n'
    + '<div class="answer"><p>' + esc(x.a) + '</p></div>\n<div class="body">' + bodyHtml + '</div>\n'
    + '<p class="src"><b>Source.</b> Adapted from <i>How To Love Your Afro</i> by Paige Lewin '
    + '(Bloomsbury, 2025), ' + esc(x.ch) + '. Written for STRAND by the author.</p>\n'
    + '<div class="cta"><h2>Stop guessing which of this applies to you</h2>'
    + '<p>STRAND asks you six questions about your hair, then builds its guidance on '
    + 'those answers rather than on a curl chart. Free to register, no appointment needed.</p>'
    + '<a href="' + BASE + '/auth">Register free</a></div>\n'
    + '<div class="nx"><h2>Related</h2><ul>' + nx + '</ul></div>\n</main>';
  fs.writeFileSync(path.join(OUT, x.slug + '.html'), shell(x.q + ' | STRAND', x.a.slice(0,155), url, schema, inner));
});

const url = BASE + '/myths/';
let groups = '';
for (const cat of Object.keys(byCat)) {
  const lis = byCat[cat].map(y => '<li><a href="' + y.slug + '.html">' + esc(y.q)
    + '<span>' + esc(y.a.slice(0,135) + '\u2026') + '</span></a></li>').join('');
  groups += '<p class="grp">' + esc(cat) + '</p><ul class="idx">' + lis + '</ul>';
}
const idxSchema = { '@context':'https://schema.org', '@graph': [
  { '@type':'CollectionPage', '@id': url + '#collection', url: url,
    name:'Afro hair myths, answered', inLanguage:'en-GB',
    description:'Sixteen of the most persistent myths about Afro and textured hair care, answered from the science in How To Love Your Afro by Paige Lewin.',
    publisher:{ '@type':'Organization', name:'STRAND', url: BASE + '/' },
    about:{ '@type':'Thing', name:'Afro and textured hair care' } },
  { '@type':'ItemList', '@id': url + '#list', numberOfItems: MYTHS.length,
    itemListElement: MYTHS.map((x,i) => ({ '@type':'ListItem', position: i+1, name: x.q, url: BASE + '/myths/' + x.slug })) },
  { '@type':'FAQPage', '@id': url + '#faq',
    mainEntity: MYTHS.map(x => ({ '@type':'Question', name: x.q, acceptedAnswer:{ '@type':'Answer', text: x.a } })) },
  { '@type':'BreadcrumbList', itemListElement: [
    { '@type':'ListItem', position:1, name:'STRAND', item: BASE + '/' },
    { '@type':'ListItem', position:2, name:'Myths' } ] } ] };
const inner = '<main>\n<p class="crumb"><a href="' + BASE + '/">STRAND</a> &rsaquo; Myths</p>\n'
  + '<h1>Afro hair myths, answered</h1>\n'
  + '<p class="lede">Sixteen things the internet gets wrong about Afro and textured hair &mdash; '
  + 'and what is actually true. Every answer is drawn from the science in '
  + '<i>How To Love Your Afro</i> by STRAND founder Paige Lewin, published by Bloomsbury.</p>\n'
  + groups + '\n<div class="cta"><h2>Built on characteristics, not curl charts</h2>'
  + '<p>STRAND records your hair as it actually behaves &mdash; diameter, density, porosity, '
  + 'elasticity, scalp condition &mdash; from six questions you answer yourself. Registering is free.</p>'
  + '<a href="' + BASE + '/auth">Register free</a></div>\n</main>';
fs.writeFileSync(path.join(OUT, 'index.html'),
  shell('Afro hair myths, answered | STRAND',
    'Sixteen persistent myths about Afro and textured hair care, answered from the science in How To Love Your Afro by Paige Lewin.',
    url, idxSchema, inner));

console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
