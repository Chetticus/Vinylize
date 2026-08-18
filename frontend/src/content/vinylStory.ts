/**
 * The Story of Vinyl — editorial content for the story tab.
 *
 * Structure: a prologue, ten chapters and an epilogue, grouped into acts
 * that run wonder → invention → culture → science → decline → revival →
 * Vinylize. The central idea the whole thing serves:
 *
 *   Humans found a way to turn invisible sound into a physical object,
 *   and that object changed how we experience music.
 *
 * Every section follows the same four-beat rhythm — the moment (a human
 * scene), what changed (the historical idea), hear the difference (an audio
 * demonstration), explore the object (an interaction in the 3D room). The
 * last two beats carry optional actions that jump into the app, so the
 * history stays connected to the thing the visitor just made.
 *
 * Static data: no backend round-trip, and readable with nothing on the
 * platter.
 */

/** Tabs a story action can send the reader to. */
export type ActionTarget = "compare" | "groove" | "waveform";

export interface StoryAction {
  label: string;
  target: ActionTarget;
}

export interface StoryBeat {
  text: string;
  action?: StoryAction;
}

export interface StoryChapter {
  /** Stable id — also the deep-link key used by the sidebar. */
  key: string;
  kind: "prologue" | "chapter" | "epilogue";
  /** Rail/pill label: "Prologue", "Chapter 03", "Epilogue". */
  label: string;
  /** Short typographic mark (never emoji). */
  glyph: string;
  title: string;
  subtitle: string;
  /** Beat 1 — a short human story or historical scene. */
  moment: string[];
  /** Beat 2 — the important historical idea. */
  whatChanged: string[];
  /** Beat 3 — an audio demonstration. */
  hear?: StoryBeat;
  /** Beat 4 — an interaction in the 3D room. */
  explore?: StoryBeat;
  /** Reflective closer (epilogue only). */
  question?: string;
}

export interface StoryAct {
  label: string;
  chapters: StoryChapter[];
}

export const VINYL_STORY: StoryAct[] = [
  {
    label: "Opening",
    chapters: [
      {
        key: "prologue",
        kind: "prologue",
        label: "Prologue",
        glyph: "◉",
        title: "The needle drops",
        subtitle: "A record starts turning, and something makes a sound before the music does",
        moment: [
          "A motor comes up to speed. The platter settles at thirty-three and a third turns a minute. The arm swings out, hesitates, and lowers — and for a second or two before any music arrives, you hear something anyway: a soft rush, maybe a tick.",
          "That is the sound of a diamond touching a piece of plastic. Every record begins this way. The noise before the music is not a fault in the recording; it is the medium introducing itself.",
        ],
        whatChanged: [
          "Underneath the ritual sits a question that ought to sound impossible. How does a groove about a twentieth of a millimetre wide hold an entire performance — a drummer, a bassline, a voice, a room's worth of air — and give it back on demand, a hundred times over?",
          "The rest of this story is a hundred and fifty years of people answering that question. And then discovering that the answer had quietly changed music itself.",
        ],
        hear: {
          text: "Press play. The first six seconds of your record are a silent lead-in groove — no music is cut there at all. Whatever you hear in that gap is the surface of the disc.",
          action: { label: "⇄ Listen in Compare", target: "compare" },
        },
        explore: {
          text: "Watch the needle settle onto the outer edge and then track slowly inward, the way a real arm crosses a side.",
          action: { label: "◎ Open the 3D room", target: "groove" },
        },
      },
    ],
  },
  {
    label: "I · Wonder and invention",
    chapters: [
      {
        key: "before",
        kind: "chapter",
        label: "Chapter 01",
        glyph: "◌",
        title: "Before music could be kept",
        subtitle: "A world where every performance happened exactly once",
        moment: [
          "Imagine wanting to hear a song again in 1850. There is precisely one way to do it: find musicians and ask them to play it again. If the singer has left town, the song has left with them.",
          "A melody could be written down. A voice could not — not its grain, not its timing, not the particular night when everything went right.",
        ],
        whatChanged: [
          "Photography had already shown that a fleeting thing could be fixed to a surface. By the 1840s people could hold a likeness of a face that no longer looked that way. The obvious next question was whether sound could be caught the same way.",
          "In 1857 a Parisian printer named Édouard-Léon Scott de Martinville got remarkably close. His phonautograph traced sound onto soot-blackened paper as fine wavy lines. He captured real voices — and had no way whatsoever to play them back. He was writing in a language nobody could yet read.",
          "That is what makes recorded sound revolutionary rather than merely convenient. It did not improve on an existing way of keeping music. There was no existing way.",
        ],
        hear: {
          text: "Nothing — and that is the chapter. Until the 1870s there was no such thing as replaying a sound. Every button in this app would have been unimaginable.",
        },
        explore: {
          text: "The wavy line Scott drew on paper is the same shape carved into the groove wall in the 3D room. He had the picture; what he lacked was the needle to read it back.",
          action: { label: "◎ See the wave in the groove", target: "groove" },
        },
      },
      {
        key: "first-sounds",
        kind: "chapter",
        label: "Chapter 02",
        glyph: "◎",
        title: "The first captured sounds",
        subtitle: "A machine says a nursery rhyme back to the man who spoke it",
        moment: [
          "Menlo Park, New Jersey, 1877. Thomas Edison wraps a sheet of tinfoil around a grooved cylinder, leans into a horn with a needle at its throat, and turns a crank while reciting a nursery rhyme. Then he sets the needle back at the start and turns the crank again.",
          "The horn says: “Mary had a little lamb.” By several accounts the people in the room were unsettled by it. The machine had done something no machine had ever done.",
        ],
        whatChanged: [
          "The principle is almost embarrassingly simple, and it has not changed since. Sound is vibration. A vibration can be pressed into a soft surface as a wiggle. Drag a needle back along that wiggle and it vibrates again in the same pattern, and the air carries it to your ear.",
          "Tinfoil was useless for anything but a demonstration. Wax cylinders through the 1880s and '90s made recordings durable enough to sell, and then something genuinely new entered human experience: you could hear a voice belonging to someone who was not there — including someone who had died. Families recorded relatives. Audiences heard singers who were nowhere in the building.",
        ],
        hear: {
          text: "Every artifact this app simulates — the hiss, the ticks, the softening of loud moments — exists because playback is mechanical contact, exactly as it was on Edison's cylinder.",
          action: { label: "⇄ Hear the medium", target: "compare" },
        },
        explore: {
          text: "Zoom in until a groove wall fills the screen. The wave cut into it is the same wave that went into the horn.",
          action: { label: "◎ Zoom into the groove", target: "groove" },
        },
      },
      {
        key: "discs",
        kind: "chapter",
        label: "Chapter 03",
        glyph: "◍",
        title: "From cylinders to discs",
        subtitle: "The shape that made a record industry possible",
        moment: [
          "A cylinder had one commercial flaw that nearly strangled recorded music in its infancy: copying it was miserable. In the early years, producing a hundred cylinders could mean performing the song a hundred times, or singing into a bank of horns and hoping for the best.",
          "Emile Berliner's answer, patented in 1887, looks obvious only in hindsight: make the record flat.",
        ],
        whatChanged: [
          "A flat disc can be stamped. Cut one master, grow a metal stamper from it, and press identical copies by the thousand, the way coins are struck. The recording stopped being the product — the master became the product, and copies became almost free.",
          "Discs also stack on a shelf instead of rolling off it, survive shipping, and carry a flat circle in the middle to print on, which is where record “labels” got their name. Shellac — a resin secreted by the lac insect — became the material, and through the 1920s the industry converged on roughly 78 revolutions per minute, giving about three minutes a side.",
          "That limit quietly rewrote songwriting. The length of a pop single is not an aesthetic law. It is the size of a piece of shellac, and we have been writing to it ever since.",
        ],
        explore: {
          text: "Your record is a disc for Berliner's reason. The spiral turning in the 3D room is exactly the geometry that could be stamped out a thousand times from one master.",
          action: { label: "◎ Look at the spiral", target: "groove" },
        },
      },
    ],
  },
  {
    label: "II · The record becomes culture",
    chapters: [
      {
        key: "modern-vinyl",
        kind: "chapter",
        label: "Chapter 04",
        glyph: "33",
        title: "The birth of modern vinyl",
        subtitle: "Columbia, RCA, and a two-year war over how fast a record should spin",
        moment: [
          "In June 1948 Columbia held a press demonstration with two piles on a table. One was a stack of shellac 78s about eight inches high. The other was a short stack of new discs holding the same music.",
          "The point landed without a word of explanation.",
        ],
        whatChanged: [
          "Columbia's engineers, led by Peter Goldmark, had changed three things at once: slow the disc to 33⅓ rpm, cut a far finer “microgroove” so turns sit closer together, and replace brittle shellac with vinyl, which is quieter, tougher and able to hold that finer detail. The result was around twenty-two minutes a side instead of three.",
          "RCA Victor refused to adopt a rival's format and launched its own a year later: a seven-inch disc at 45 rpm with a wide centre hole and a fast automatic changer. For about two years the speeds fought, and buyers were stuck in the middle. The truce became a division of labour that lasted fifty years — the LP took the album, the 45 took the single, the 78 quietly died.",
          "The artistic consequence outgrew the technical one. Before the LP, an “album” meant a literal book of paper sleeves holding several 78s. Afterwards a musician could make one continuous twenty-minute statement and expect it to be heard in order, as a whole.",
        ],
        explore: {
          text: "The record on your platter is cut in exactly this format — 33⅓ rpm, a quarter-millimetre of groove pitch — and the 3D room is turning at that speed right now.",
          action: { label: "◎ See your microgroove", target: "groove" },
        },
      },
      {
        key: "golden-age",
        kind: "chapter",
        label: "Chapter 05",
        glyph: "❏",
        title: "The golden age of the record",
        subtitle: "When a storage medium became an identity",
        moment: [
          "A record shop in 1965 has listening booths along one wall. You pull something off the rack, hand it over, step into the booth, and the shop plays it for you while you stand there deciding. Nobody has heard this album at home yet. This is how you find out.",
          "Down the street a jukebox holds a hundred 45s and a generation's worth of arguments about which button to press.",
        ],
        whatChanged: [
          "Vinyl stopped being merely a way to store sound and became an object with a culture around it. A twelve-inch sleeve is a foot square, held in both hands for twenty minutes at a time — effectively a small gallery in every home. Cover art became a career. Gatefolds opened into murals. Liner notes told you who played what, and where.",
          "Records were how taste became visible. You could read a shelf of them and learn something about a person. They were lent, argued over, taped for friends, carried to parties, queued at the school disco.",
          "There is even a private tradition hidden on the disc itself: in the blank “dead wax” between the last groove and the label, mastering engineers scratched initials and jokes by hand. Tilt an old record to the light and you may find a message from someone in a cutting room fifty years ago.",
        ],
        explore: {
          text: "The label spinning in the 3D room carries your uploaded track's name — the same twelve-inch canvas, minus the cardboard.",
          action: { label: "◎ Read your label", target: "groove" },
        },
      },
    ],
  },
  {
    label: "III · Inside the object",
    chapters: [
      {
        key: "inside-groove",
        kind: "chapter",
        label: "Chapter 06",
        glyph: "⌇",
        title: "Inside the groove",
        subtitle: "How a scratch in plastic becomes a band playing in your room",
        moment: [
          "Stop the timeline for a moment and look at what is physically happening. Under magnification, a record's surface is a single spiral canyon roughly a twentieth of a millimetre across, running unbroken for something like half a kilometre.",
          "The walls of that canyon are not smooth. They wave.",
        ],
        whatChanged: [
          "Cutting: a lathe drives a heated stylus across a lacquer disc while the music pushes it sideways. Loud means wider swings; high notes mean tighter wiggles. The shape in the wall is a physical drawing of sound pressure over time.",
          "Playing: a diamond tip rides in that groove and is shaken by the walls. The tip sits on a thin cantilever with a magnet at the other end, suspended inside a coil — as the magnet moves, it induces a tiny voltage. A phono preamp lifts that whisper to usable level, an amplifier drives it harder, and a speaker cone converts it back into moving air.",
          "Stereo hides in the same trench through geometry: cut the groove as a V and treat each wall, angled at 45 degrees, as its own channel. Motion shared by both walls is the mono sum, which is why stereo records still played correctly on mono equipment and nobody had to throw anything away.",
          "The failure modes follow from the same picture. Dust in the groove deflects the tip — a tick. A scratch across the walls — a pop, or a skip if the tip is thrown clean out of its lane. And because the whole system works by friction, every play removes a little of what it is reading.",
        ],
        hear: {
          text: "The clicks in the vinyl version are not sprinkled at random. They are scattered along the groove's physical length, so how often you hear one depends on how fast the disc is passing the needle.",
          action: { label: "⇄ Listen for the ticks", target: "compare" },
        },
        explore: {
          text: "Zoom all the way into the microscope view. The V-shaped trench there is built from your own audio at true scale, with the stylus resting in it.",
          action: { label: "◎ Enter the microscope", target: "groove" },
        },
      },
      {
        key: "why-sounds",
        kind: "chapter",
        label: "Chapter 07",
        glyph: "≈",
        title: "Why vinyl sounds like vinyl",
        subtitle: "Taking the word “warm” seriously",
        moment: [
          "Ask why someone prefers records and the word that comes back is almost always “warm”. It is a strange thing to call a mechanical process, and it deserves to be taken seriously rather than waved away as nostalgia.",
        ],
        whatChanged: [
          "Part of the answer is genuinely physical. Cutting to vinyl imposes limits: bass has to be controlled or the groove collides with its neighbour; treble gets gentler as the needle spirals inward and the groove passes it more slowly; loud passages are rounded off slightly by the mechanical give of the cutting chain and the stylus suspension. Records also tend to be mastered less aggressively than their streaming counterparts, because the format refuses to be squashed as hard.",
          "Add the medium's own voice — a low surface hiss, the occasional tick — and you get a sound with both a floor and a ceiling. Nothing is ever perfectly silent, and nothing is ever savagely loud.",
          "The other part of the answer is not technical at all. You chose the record, took it out of its sleeve, and started it on purpose. Skipping is inconvenient. Twenty minutes later you are still there. Attention is not an audio specification, but it changes what you hear.",
        ],
        hear: {
          text: "This is the app's main event. Flip between Original and Vinyl while a track plays: nothing in that difference is an EQ preset, and everything in it comes from simulating the mechanics of the previous chapter.",
          action: { label: "⇄ Switch between the two", target: "compare" },
        },
      },
    ],
  },
  {
    label: "IV · Reinvention and decline",
    chapters: [
      {
        key: "changes-music",
        kind: "chapter",
        label: "Chapter 08",
        glyph: "⟲",
        title: "Vinyl changes music again",
        subtitle: "The moment the record stopped being a recording and became an instrument",
        moment: [
          "The Bronx, 1973. At a back-to-school party, DJ Kool Herc notices that the dancers come alive during one short instrumental break in a funk record. So he buys a second copy of the same record, cues both turntables, and cuts between them — stretching a five-second break into five minutes.",
          "The dancers who thrived in that gap got a name: break-boys.",
        ],
        whatChanged: [
          "The technique spread and deepened fast. Grandmaster Flash worked out how to cue a record by ear and drop it precisely on the beat. Grand Wizzard Theodore, still a teenager, discovered that dragging a record back and forth under the needle made a sound worth keeping — the scratch.",
          "This inverted the entire idea of a record. For eighty years the goal had been faithful reproduction: a record was a performance to be replayed without alteration. Now it was raw material, and the turntable was something you played with your hands.",
          "Everything downstream follows — sampling, hip-hop production, remix culture, house and techno assembled live from other people's records, and crate digging: the practice of listening through thousands of forgotten albums hunting for four seconds worth taking.",
        ],
        explore: {
          text: "Click anywhere on the groove in the 3D room to drop the needle at that moment. It is a crude descendant of cueing a record by hand.",
          action: { label: "◎ Drop the needle yourself", target: "groove" },
        },
      },
      {
        key: "digital",
        kind: "chapter",
        label: "Chapter 09",
        glyph: "◇",
        title: "The rise of digital",
        subtitle: "Convenience quietly replaces ritual",
        moment: [
          "By the early 1980s the argument looked finished. The compact disc arrived in 1982 promising precisely what vinyl could not: no surface noise, no wear from playing, no skipping, no side to flip. Early advertising reached for the phrase “perfect sound forever”.",
        ],
        whatChanged: [
          "Convenience had already been chipping away for years. Philips' compact cassette (1963) made music portable and, with the Walkman in 1979, personal — and handed a generation the mixtape. The CD then removed the last excuses: within about six years it outsold the LP, and by the early nineties the major labels had wound vinyl production down to almost nothing. Pressing plants closed and their machines were scrapped or shipped abroad.",
          "Then compression went further than anyone expected. MP3 shrank an album small enough to cross a phone line, file sharing detached music from any object at all, and streaming completed the journey: every song ever recorded, instantly, for a monthly fee.",
          "Each step traded ritual for access. Nothing about a streaming library asks you to choose, wait, get up, or turn anything over. That is its enormous advantage — and, as it turned out, exactly what the revival would be about.",
        ],
      },
    ],
  },
  {
    label: "V · The return",
    chapters: [
      {
        key: "refused",
        kind: "chapter",
        label: "Chapter 10",
        glyph: "↻",
        title: "The record that refused to die",
        subtitle: "Why an obsolete object came back on purpose",
        moment: [
          "The format never entirely died, mostly because DJs would not allow it. All through the CD's dominance, dance and hip-hop kept buying records, and a stubborn network of independent shops kept selling them.",
          "In 2008 a handful of those shops invented Record Store Day, largely to get people through the door. It landed in the middle of something larger: sales of new vinyl had quietly begun climbing, and they kept climbing for well over a decade.",
        ],
        whatChanged: [
          "In the United States, vinyl revenue passed CDs in 2020 for the first time since 1986, and overtook them in units sold shortly afterwards. Plants that had been idle for twenty years reopened, new ones were built, and waiting times for pressing runs stretched into months.",
          "The reasons buyers give are rarely about fidelity. They talk about the sleeve, about owning rather than renting, about a side of music being a decision instead of an endless feed. A record asks you to commit roughly twenty minutes of attention, and that requirement turned out to be a feature.",
          "It is not a frictionless happy ending. Records are petrochemical objects — PVC pressed with steam and shipped heavy — and the industry is still working through recycled compounds, greener plants and long queues. Choosing vinyl means choosing something costly in more than money.",
        ],
        explore: {
          text: "Look at the wide, nearly empty spiral just outside the label in the 3D room. On a pressed record that run-out is where the cutting engineer's signature would be scratched by hand.",
          action: { label: "◎ Find the run-out", target: "groove" },
        },
      },
    ],
  },
  {
    label: "Closing",
    chapters: [
      {
        key: "epilogue",
        kind: "epilogue",
        label: "Epilogue",
        glyph: "●",
        title: "Bringing the ritual into the digital world",
        subtitle: "What this app is actually for",
        moment: [
          "Back in the room. The platter is turning, the arm is tracking slowly inward, and under the needle your own song is being read out of a groove that does not physically exist.",
        ],
        whatChanged: [
          "Digital gave us access: everything, everywhere, immediately, and that is a genuine good that no amount of nostalgia should talk anyone out of. Vinyl offered close to the opposite — one album, one side, one room, and an object you had to handle. They are not competing answers to the same question.",
          "What Vinylize does is borrow the physics and hand it back as an experience. Your music is cut into a spiral, read by a simulated diamond, given all the imperfection that implies — and then placed beside the pristine original so you can switch between them and hear exactly what the object costs, and what it adds.",
        ],
        hear: {
          text: "Flip between Original and Vinyl one last time, now knowing that everything you hear change is a hundred and fifty years of engineering and a needle in a groove.",
          action: { label: "⇄ One more listen", target: "compare" },
        },
        question: "If every song ever recorded is one tap away, what makes us stop and truly listen?",
      },
    ],
  },
];

/** Flat chapter list in reading order. */
export const ALL_CHAPTERS: StoryChapter[] = VINYL_STORY.flatMap((a) => a.chapters);

/** Act label a chapter belongs to. */
export function actOf(key: string): string {
  return VINYL_STORY.find((a) => a.chapters.some((c) => c.key === key))?.label ?? "";
}
