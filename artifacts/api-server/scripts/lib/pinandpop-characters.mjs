/**
 * Characters from Pin & Pop pin names.
 *
 * Pin & Pop has no character field; the character is usually in the pin's
 * name ("The Mark Twain Riverboat - Minnie Mouse"). This finds known
 * characters in the name by whole-word match against a curated list:
 * canonical name → aliases. Longer matches win over shorter ones inside
 * them ("Minnie Mouse" over "Minnie"; "Mickey's" still matches "Mickey").
 *
 * Deliberately left out: names that are everyday words and would mislabel
 * pins ("Joy", "Happy", "Boo", "Angel", "Animal", "Rabbit", "Owl", "Max",
 * "Flash", "Kevin", "Flower", "Eve", "Ray", "Dash", "Violet", "Crush", "Doc",
 * "Arthur", "Rocket"), and ambiguous ones that need their full form ("Jack" →
 * only "Jack Skellington" / "Jack Sparrow" / "Jack and Sally"; "Mike" → "Mike
 * Wazowski"). Event, programme and artist names that contain a character's
 * name ("Sleepy Hollow", "Hidden Mickey", "Mickey's Not-So-Scary Halloween
 * Party", "Eric Robison") are blanked out first.
 *
 * Only the pin's own name is used, never its set name: a set named after a
 * film holds pins of other characters too ("Hercules Character Vases: The
 * Muses"), so set-name matches were wrong about half the time in review.
 */

/** canonical → extra spellings (the canonical name always matches itself). */
export const CHARACTERS = {
  // Mickey & friends
  "Mickey Mouse": ["Mickey", "Sorcerer Mickey", "Steamboat Willie"],
  "Minnie Mouse": ["Minnie"],
  "Donald Duck": ["Donald"],
  "Daisy Duck": ["Daisy"],
  "Goofy": [],
  "Pluto": [],
  "Chip": [],
  "Dale": [],
  "Max Goof": [],
  "Pete": [],
  "Clarabelle Cow": ["Clarabelle"],
  "Horace Horsecollar": ["Horace"],
  "Figaro": [],
  "Oswald the Lucky Rabbit": ["Oswald"],
  "Ludwig Von Drake": [],
  "Scrooge McDuck": ["Scrooge"],
  "Huey": [], "Dewey": [], "Louie": [],
  "Launchpad McQuack": ["Launchpad"],
  "Darkwing Duck": ["Darkwing"],
  "Gizmoduck": [],
  "José Carioca": ["Jose Carioca"],
  "Panchito": [],
  "Duffy": [], "ShellieMay": ["Shellie May"], "Gelatoni": [], "StellaLou": ["Stella Lou"],
  "CookieAnn": ["Cookie Ann"], "'Olu Mel": ["Olu Mel"], "LinaBell": ["Lina Bell"],
  // Classic animation
  "Snow White": [], "Evil Queen": ["The Queen (Snow White)"], "Dopey": [], "Grumpy": [], "Sleepy": [],
  "Sneezy": [], "Bashful": [],
  "Pinocchio": [], "Jiminy Cricket": ["Jiminy"], "Geppetto": [], "Cleo": [], "Honest John": [],
  "Dumbo": [], "Timothy Q. Mouse": ["Timothy Mouse", "Timothy"],
  "Bambi": [], "Thumper": [],
  "Cinderella": [], "Fairy Godmother": [], "Lady Tremaine": [], "Anastasia": [], "Drizella": [],
  "Gus": [], "Jaq": [], "Lucifer": [], "Prince Charming": [],
  "Alice": [], "Mad Hatter": [], "Cheshire Cat": [], "White Rabbit": [], "Queen of Hearts": [],
  "March Hare": [], "Dinah": [], "Tweedle Dee": [], "Tweedle Dum": [], "Caterpillar": [],
  "Peter Pan": [], "Tinker Bell": ["Tink", "Tinkerbell"], "Captain Hook": ["Hook"], "Mr. Smee": ["Smee"],
  "Wendy": [], "Tick-Tock the Crocodile": ["Tick-Tock", "Tick Tock"],
  "Lady": [], "Tramp": [],
  "Aurora": ["Sleeping Beauty"], "Maleficent": [], "Flora": [], "Fauna": [], "Merryweather": [], "Prince Phillip": [],
  "Pongo": [], "Perdita": [], "Cruella de Vil": ["Cruella"], "Nana": [],
  "Roger Rabbit": [], "Jessica Rabbit": [], "Brer Rabbit": [], "Brer Fox": [], "Brer Bear": [],
  "Chicken Little": [], "John Silver": ["Long John Silver"], "Jim Hawkins": [], "Bolt": [],
  "Merlin": [], "Archimedes": [], "Madam Mim": [],
  "Mowgli": [], "Baloo": [], "Bagheera": [], "King Louie": [], "Kaa": [], "Shere Khan": [],
  "Duchess": [], "Marie": [], "Toulouse": [], "Berlioz": [], "Thomas O'Malley": ["O'Malley"],
  "Robin Hood": [], "Maid Marian": [], "Little John": [], "Prince John": [], "Sir Hiss": [],
  "Winnie the Pooh": ["Pooh", "Winnie-the-Pooh"], "Tigger": [], "Eeyore": [], "Piglet": [],
  "Roo": [], "Kanga": [], "Heffalump": ["Heffalumps"],
  "Bernard": [], "Bianca": [],
  "Basil of Baker Street": ["Basil"], "Ratigan": [],
  "Mary Poppins": [], "Bert": [],
  "Hyacinth Hippo": [], "Chernabog": [],
  // Renaissance and later
  "Ariel": [], "Flounder": [], "Sebastian": [], "Ursula": [], "Scuttle": [], "King Triton": ["Triton"],
  "Prince Eric": ["Eric"], "Flotsam": [], "Jetsam": [], "Max (Little Mermaid)": [],
  "Belle": [], "Beast": [], "Gaston": [], "Lumiere": [], "Cogsworth": [], "Mrs. Potts": [], "Chip Potts": [],
  "Aladdin": [], "Jasmine": [], "Genie": [], "Jafar": [], "Iago": [], "Abu": [], "Rajah": [], "Magic Carpet": [],
  "Simba": [], "Nala": [], "Mufasa": [], "Scar": [], "Timon": [], "Pumbaa": [], "Rafiki": [], "Zazu": [],
  "Pocahontas": [], "Meeko": [], "Flit": [], "John Smith": [],
  "Quasimodo": [], "Esmeralda": [], "Frollo": [],
  "Hercules": [], "Megara": ["Meg"], "Hades": [], "Pegasus": [], "Philoctetes": ["Phil"], "Pain and Panic": ["Pain & Panic"],
  "Mulan": [], "Mushu": [], "Cri-Kee": [], "Li Shang": ["Shang"],
  "Tarzan": [], "Jane Porter": [],
  "Kuzco": [], "Yzma": [], "Kronk": [], "Pacha": [],
  "Milo Thatch": ["Milo"], "Kida": [],
  "Lilo": [], "Stitch": ["Experiment 626"], "Scrump": [], "Jumba": [], "Pleakley": [], "Nani": [],
  "Kenai": [], "Koda": [],
  "Tiana": [], "Prince Naveen": ["Naveen"], "Louis": [], "Dr. Facilier": ["Facilier"],
  "Rapunzel": [], "Flynn Rider": ["Flynn"], "Pascal": [], "Maximus": [], "Mother Gothel": ["Gothel"],
  "Merida": [],
  "Wreck-It Ralph": ["Ralph"], "Vanellope": [],
  "Elsa": [], "Anna": [], "Olaf": [], "Kristoff": [], "Sven": [], "Hans": [],
  "Baymax": [], "Hiro": [],
  "Judy Hopps": [], "Nick Wilde": [],
  "Moana": [], "Maui": [], "Hei Hei": ["HeiHei"], "Pua": [],
  "Raya": [], "Sisu": [],
  "Mirabel": [], "Bruno": [], "Luisa Madrigal": ["Luisa"], "Isabela": [],
  "Asha": [], "Valentino": [],
  // Pixar
  "Woody": [], "Buzz Lightyear": ["Buzz"], "Jessie": [], "Bullseye": [], "Rex": [], "Hamm": [],
  "Slinky Dog": ["Slinky"], "Mr. Potato Head": ["Potato Head"], "Little Green Men": ["Aliens (Toy Story)"],
  "Lotso": [], "Forky": [], "Bo Peep": [], "Zurg": [], "Wheezy": [],
  "Mike Wazowski": [], "Sulley": ["Sully"], "Randall": [], "Roz": [],
  "Nemo": [], "Captain Nemo": [], "Dory": [], "Marlin": [], "Squirt": [], "Bruce": [], "Hank": [],
  "Mr. Incredible": [], "Elastigirl": [], "Jack-Jack": [], "Frozone": [], "Edna Mode": ["Edna"],
  "Lightning McQueen": ["McQueen"], "Mater": [], "Sally Carrera": [],
  "Remy": [], "Emile": [],
  "WALL-E": ["Wall-E", "Wall E"],
  "Carl Fredricksen": ["Carl"], "Russell": [], "Dug": [],
  "Sadness": [], "Anger": [], "Disgust": [], "Bing Bong": [],
  "Miguel": [], "Dante": [], "Héctor": ["Hector"],
  "Luca": [], "Alberto": [],
  "Mei Lee": [],
  "Ember": [], "Wade": [],
  // Parks & attractions characters
  "Figment": [], "Dreamfinder": [], "Orange Bird": [],
  "Hatbox Ghost": [], "Madame Leota": [], "Hitchhiking Ghosts": [], "Constance Hatchaway": ["Constance"],
  "Captain Jack Sparrow": ["Jack Sparrow"],
  // Nightmare Before Christmas, Hocus Pocus
  "Jack Skellington": [], "Sally": [], "Zero": [], "Oogie Boogie": [],
  "Lock Shock and Barrel": ["Lock, Shock and Barrel", "Lock, Shock, and Barrel", "Lock, Shock & Barrel", "Lock Shock & Barrel"],
  "Mayor of Halloween Town": [], "Headless Horseman": [], "Ichabod Crane": ["Ichabod"],
  "Winifred Sanderson": ["Winifred"], "Mary Sanderson": [], "Sarah Sanderson": [], "Billy Butcherson": [], "Binx": [],
  // Star Wars
  "Darth Vader": ["Vader"], "Luke Skywalker": [], "Princess Leia": ["Leia"], "Han Solo": [], "Chewbacca": ["Chewie"],
  "Yoda": [], "Grogu": ["The Child", "Baby Yoda"], "The Mandalorian": ["Mandalorian", "Din Djarin", "Mando"],
  "R2-D2": ["R2D2"], "C-3PO": ["C3PO"], "BB-8": ["BB8"], "Stormtrooper": ["Stormtroopers"], "Boba Fett": [],
  "Kylo Ren": [], "Rey": [], "Ahsoka Tano": ["Ahsoka"], "Obi-Wan Kenobi": ["Obi-Wan"], "Ewok": ["Ewoks"],
  "Darth Maul": [], "Emperor Palpatine": ["Palpatine"], "Porg": ["Porgs"], "Captain Rex": [],
  // Marvel
  "Spider-Man": ["Spiderman"], "Iron Man": [], "Captain America": [], "Thor": [], "Hulk": [], "Black Widow": [],
  "Loki": [], "Groot": [], "Rocket Raccoon": [], "Black Panther": [], "Doctor Strange": [], "Scarlet Witch": [],
  "Deadpool": [], "Captain Marvel": [], "Ant-Man": ["Ant Man"], "Thanos": [], "Star-Lord": [], "Wolverine": [],
  // Muppets and others
  "Kermit": [], "Miss Piggy": [], "Fozzie Bear": ["Fozzie"], "Gonzo": [], "Sam Eagle": [], "Swedish Chef": [],
  "Phineas": [], "Ferb": [], "Perry the Platypus": ["Perry"],
};

const norm = (s) => String(s ?? "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[‘’ʼ]/g, "'").replace(/[‐-―]/g, "-")
  .toLowerCase();

/** Phrases that contain a character name but don't mean the pin shows that character. */
export const NOT_A_CHARACTER = [
  "sleepy hollow", "flower and garden", "flower & garden", "flower & garden festival",
  "king arthur carrousel", "king arthur carousel",
  "mickey's not-so-scary halloween party", "mickey's not so scary halloween party",
  "mickey's very merry christmas party", "mickey's halloween party", "mickey's christmas party",
  "mickey's toontown", "minnie van", "minnie vans", "mickey's philharmagic",
  "parasol lady", "lady luck", "lady bullseye", "lady liberty", "lady death", "lady sif",
  "hidden mickey", "hidden mickeys", "eric robison", "timothy loucks", "t-rex", "t rex", "lightning bolt",
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Canonicals with a qualifier in brackets ("Chip (teacup)") are listed for
// completeness but never matched by name: they only exist to keep the
// unqualified name free for the main character.
/** Phrases that name a pair or group: each one tags every character in it. */
export const GROUPS = {
  "Chip and Dale": { names: ["Chip", "Dale"], aliases: ["Chip 'n' Dale", "Chip 'n Dale", "Chip n Dale", "Chip n' Dale", "Chip & Dale", "Chip and Dale"] },
  "Lady and the Tramp": { names: ["Lady", "Tramp"], aliases: ["Lady and the Tramp", "Lady & the Tramp", "Lady & Tramp", "Lady and Tramp"] },
  "Lilo and Stitch": { names: ["Lilo", "Stitch"], aliases: ["Lilo & Stitch", "Lilo and Stitch"] },
  "Mike and Sulley": { names: ["Mike Wazowski", "Sulley"], aliases: ["Mike & Sulley", "Mike and Sulley", "Mike & Sully", "Mike and Sully"] },
  "Timon and Pumbaa": { names: ["Timon", "Pumbaa"], aliases: ["Timon & Pumbaa", "Timon and Pumbaa"] },
  "Jack and Sally": { names: ["Jack Skellington", "Sally"], aliases: ["Jack and Sally", "Jack & Sally"] },
  "Stitch and Angel": { names: ["Stitch", "Angel"], aliases: ["Stitch and Angel", "Stitch & Angel", "Angel and Stitch", "Angel & Stitch"] },
  "Huey, Dewey and Louie": { names: ["Huey", "Dewey", "Louie"], aliases: ["Huey, Dewey and Louie", "Huey, Dewey & Louie", "Huey Dewey and Louie", "Huey Dewey & Louie"] },
};

const PATTERNS = [
  ...Object.entries(CHARACTERS)
    .filter(([canonical]) => !/\(.*\)$/.test(canonical))
    .flatMap(([canonical, aliases]) => [canonical, ...aliases].map((alias) => ({ names: [canonical], alias: norm(alias) }))),
  ...Object.values(GROUPS).flatMap((g) => g.aliases.map((alias) => ({ names: g.names, alias: norm(alias) }))),
]
  .filter((p) => p.alias.length >= 3)
  .sort((a, b) => b.alias.length - a.alias.length)
  .map((p) => ({ ...p, re: new RegExp(`(?<![a-z0-9])${escape(p.alias)}(?![a-z0-9])`, "g") }));

/** Characters named in `text`, in the order they appear (longest match wins on overlap). */
export function findCharacters(text) {
  let t = norm(text);
  // Blank out (same length, so positions stay put) phrases that aren't characters.
  for (const phrase of NOT_A_CHARACTER) t = t.split(phrase).join(" ".repeat(phrase.length));
  const taken = [];
  const found = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(t); m; m = p.re.exec(t)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      p.names.forEach((canonical, i) => found.push({ canonical, start, i }));
    }
  }
  const seen = new Set();
  return found.sort((a, b) => a.start - b.start || a.i - b.i)
    .map((f) => f.canonical)
    .filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
}

/**
 * Same name, different character, told apart by the rest of the name and set:
 * Chip the teacup (Beauty and the Beast) vs Chip the chipmunk, and Sally
 * Carrera (Cars) vs Sally (Nightmare Before Christmas).
 */
const SAME_NAME = [
  { name: "Chip", becomes: "Chip Potts", when: /mrs\.? potts|belle|beauty and the beast|beast|cogsworth|lumiere/, unless: /\bdale\b/ },
  { name: "Sally", becomes: "Sally Carrera", when: /mcqueen|\bcars\b|mater|radiator springs/, unless: /jack|skellington|nightmare/ },
];

function disambiguate(names, context) {
  return names.map((n) => {
    const rule = SAME_NAME.find((r) => r.name === n);
    return rule && rule.when.test(context) && !rule.unless.test(context) ? rule.becomes : n;
  }).filter((n, i, all) => all.indexOf(n) === i);
}

/**
 * Character columns for a pin, or null when none is found.
 * `series` is used only to tell same-named characters apart (Chip / Chip Potts).
 * { main_character, all_characters ("A, B"), character_confidence: 'name', character_review_status: 'auto_matched' }
 */
export function charactersForPin(name, series) {
  let names = findCharacters(name);
  if (!names.length) return null;
  names = disambiguate(names, `${norm(name)} ${norm(series)}`);
  return {
    main_character: names[0],
    all_characters: names.join(", "),
    character_confidence: "name",
    character_review_status: "auto_matched",
  };
}
