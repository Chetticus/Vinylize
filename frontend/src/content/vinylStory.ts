/**
 * The Vinyl Story — editorial content for the story tab.
 *
 * Static data, deliberately: this is history, not a readout of the user's
 * upload, so it needs no backend round-trip and never changes between
 * renders. A few chapters carry a `yourRecord` line that ties the history
 * back to the disc currently on the platter — the one place where the
 * story and the simulation touch.
 */

export interface StoryChapter {
  /** Stable id — also the deep-link key used by the sidebar. */
  key: string;
  year: string;
  /** Short typographic mark for the rail (never emoji). */
  glyph: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
  /** Pull-fact highlighted beneath the prose. */
  fact?: string;
  /** Optional tie-in to the record the visitor just made. */
  yourRecord?: string;
}

export interface StoryEra {
  label: string;
  chapters: StoryChapter[];
}

export const VINYL_STORY: StoryEra[] = [
  {
    label: "I · The invention of playback",
    chapters: [
      {
        key: "edison",
        year: "1877",
        glyph: "◎",
        title: "Sound made solid",
        subtitle: "The year a machine first gave a voice back",
        paragraphs: [
          "Twenty years before Edison, a Parisian printer named Édouard-Léon Scott de Martinville had already found a way to write sound down. His phonautograph traced vibrations onto soot-blackened paper as delicate wavy lines. He could capture a voice perfectly — he simply had no way to play it back. The lines sat there, silent, for a century and a half.",
          "In 1877, at his workshop in Menlo Park, Thomas Edison closed the loop. He wrapped a cylinder in tinfoil, spoke into a horn attached to a needle, and let the needle dent the foil as the cylinder turned. Then he put the needle back at the start and turned the cylinder again. The horn spoke: “Mary had a little lamb.”",
          "The idea underneath is almost absurdly simple, and it is still exactly how the record on the platter works. Sound is vibration. A vibration can be carved into a surface as a wiggle. Drag a needle back along that wiggle and it vibrates again. Everything since — shellac, vinyl, stereo, the diamond tip — is refinement of that one trick.",
        ],
        fact: "Scott de Martinville's recordings were finally heard in 2008, when researchers scanned his paper traces and converted the images back into sound.",
      },
      {
        key: "berliner",
        year: "1887",
        glyph: "◍",
        title: "Why the disc beat the cylinder",
        subtitle: "Emile Berliner and the birth of a record industry",
        paragraphs: [
          "Edison's cylinders sounded good, but they had a commercial flaw: copying them was miserable. For years, making a hundred cylinders often meant performing the song again, and again, into banks of horns. The recording was the product, one at a time.",
          "Emile Berliner's gramophone, patented in 1887, replaced the cylinder with a flat disc — and that changed everything, because a flat disc can be pressed. Cut one master, make a metal stamper from it, and you can punch out identical copies by the thousand, the way coins are struck.",
          "That is the moment a record industry becomes possible. Discs also stack on a shelf instead of rolling off it, they survive shipping, and they have a flat circle in the middle where you can print a label — which is how record labels got the name.",
        ],
        fact: "Berliner's discs were cut laterally, side to side, while Edison's cylinders were cut vertically, up and down. Lateral cutting won, and it is still the basis of the mono groove today.",
      },
      {
        key: "shellac",
        year: "1925",
        glyph: "78",
        title: "The shellac era",
        subtitle: "Why a pop song is about three minutes long",
        paragraphs: [
          "Early discs were made of shellac — a resin secreted by the lac insect, harvested in South and Southeast Asia and mixed with fillers like powdered slate. Shellac records were heavy, noisy, and brittle enough that a dropped one shattered. Every collector has a story about a broken 78.",
          "Through the 1920s the industry converged on roughly 78 revolutions per minute, a speed that fell out of the motors and gearing available at the time. At that speed, a ten-inch side held about three minutes of music.",
          "That physical limit quietly rewrote songwriting. If a record holds three minutes, songs become three minutes. The length of the modern pop single is not an artistic law — it is the size of a piece of shellac, and we have been writing to it ever since.",
        ],
        fact: "In 1925 the industry switched from recording into acoustic horns to electrical recording with microphones — the first time a singer could be quiet and still be heard.",
      },
    ],
  },
  {
    label: "II · The album takes shape",
    chapters: [
      {
        key: "lp",
        year: "1948",
        glyph: "33",
        title: "The long-playing record",
        subtitle: "Columbia gives music room to stretch out",
        paragraphs: [
          "Before 1948, an “album” meant something literal: a bound book of paper sleeves, each holding one 78, sold together the way a photo album holds photographs. A symphony arrived as a stack of discs you had to keep getting up to flip.",
          "Columbia's engineers, led by Peter Goldmark, attacked the problem from three sides at once. They slowed the disc to 33⅓ rpm, cut a far finer “microgroove” so the turns could sit closer together, and abandoned brittle shellac for vinyl — quieter, tougher, and able to hold that finer groove.",
          "The result held around twenty-two minutes per side. For the first time an artist's continuous statement fit on a single object. The album as an art form starts here: the LP invented the format, and musicians spent the next thirty years discovering what to do with it.",
        ],
        yourRecord:
          "Your record is cut at 33⅓ rpm in a 0.25 mm-pitch microgroove — the exact format Columbia introduced in 1948. The platter in the 3D Groove tab is turning at that speed right now.",
      },
      {
        key: "war",
        year: "1949",
        glyph: "45",
        title: "The war of the speeds",
        subtitle: "RCA answers with a small disc and a big hole",
        paragraphs: [
          "RCA Victor did not adopt a rival's format quietly. A year after the LP, it launched its own: a seven-inch disc spinning at 45 rpm, with a distinctive wide centre hole and a changer that could drop a stack of them automatically.",
          "For about two years the industry fought over which speed would win, and buyers were stuck in the middle — a player for one format could not handle the other. Retailers hated it. Many customers simply waited it out.",
          "The truce turned out to be a division of labour that lasted half a century: the LP took the album, the 45 took the single, and the 78 quietly died. If you have ever seen a jukebox loaded with small records, that is RCA's side of the argument still playing.",
        ],
        fact: "The 45's oversized hole was designed for fast automatic changers — and it is why plastic centre adapters still turn up in every box of second-hand singles.",
      },
      {
        key: "stereo",
        year: "1958",
        glyph: "⇄",
        title: "Two channels, one groove",
        subtitle: "Stereo, without making every record player obsolete",
        paragraphs: [
          "Stereo sound was well understood by the 1950s, but records had a hard constraint: one groove, one needle. Putting two independent channels into a single trench looked impossible without abandoning every player already in people's living rooms.",
          "The Westrex system solved it with a piece of geometry. Cut the groove as a V, and treat each of its two walls — each angled at 45 degrees — as its own channel. The needle rides both walls at once, and the cartridge senses the two directions separately.",
          "The elegance is in what it did not break. Motion shared by both walls is exactly what a mono needle already read, so a stereo record still played, correctly, on a mono player. Nobody had to throw anything away, which is a large part of why stereo caught on at all.",
        ],
        yourRecord:
          "If you uploaded a stereo file, both walls of your groove are doing different work. The 3D Groove tab can show them separately — the mono sum swings the groove side to side, the stereo difference makes it breathe deeper and shallower.",
      },
      {
        key: "sleeve",
        year: "1967",
        glyph: "❏",
        title: "The twelve-inch canvas",
        subtitle: "When the packaging became part of the art",
        paragraphs: [
          "A twelve-inch sleeve is a big piece of card — roughly a foot square, held in both hands, studied while the side plays. Almost by accident, the LP handed visual artists a gallery in every home, and by the mid-sixties musicians were treating the cover as part of the work rather than a wrapper for it.",
          "Gatefolds opened out into murals. Sleeves came with cut-outs, posters, stickers, lyrics printed large enough to read. The 1967 cover for Sgt. Pepper's Lonely Hearts Club Band — a crowd of cardboard celebrities assembled by Peter Blake and Jann Haworth — reportedly cost more than most albums cost to record.",
          "There is a smaller, stranger tradition hidden on the disc itself. In the blank space between the last groove and the label — the “dead wax” — mastering engineers scratched their initials, in-jokes and messages by hand. Turn a record to the light and you may find someone's signature from decades ago.",
        ],
        fact: "The engineer George Peckham signed so many run-outs “A PORKY PRIME CUT” that collectors still read it as a mark of quality.",
      },
      {
        key: "turntablism",
        year: "1975",
        glyph: "⟲",
        title: "The turntable becomes an instrument",
        subtitle: "Hip-hop stops playing records and starts playing the player",
        paragraphs: [
          "In the Bronx in 1973, DJ Kool Herc noticed that dancers came alive during the short instrumental break in a funk record — so he bought two copies of the same record and cut between them, extending a few seconds into an unbroken groove. The break became the song.",
          "The technique multiplied fast. Grandmaster Flash worked out how to cue a record by ear and drop it precisely on the beat. Grand Wizzard Theodore, still a teenager, is credited with discovering that dragging a record back and forth under the needle made a sound worth keeping — the scratch.",
          "This reframed the object completely. A record was no longer a fixed performance to be reproduced faithfully; it was raw material, and the turntable was something you played. When the industry later abandoned vinyl, DJ culture is a large part of what kept presses running at all.",
        ],
        fact: "Technics' SL-1200, introduced in 1972, became the standard because its direct-drive motor could be stopped and shoved by hand and still snap back to speed. It was discontinued in 2010 and brought back in 2016 after sustained demand.",
      },
    ],
  },
  {
    label: "III · Death and revival",
    chapters: [
      {
        key: "cd",
        year: "1982",
        glyph: "◇",
        title: "The digital eclipse",
        subtitle: "How quickly a hundred-year format was written off",
        paragraphs: [
          "The compact disc arrived in 1982, and its pitch was aimed squarely at everything vinyl could not do: no surface noise, no wear from playing, no skipping, no side to flip. Early marketing promised “perfect sound forever” — a phrase that has aged into a joke, but at the time it was a genuinely thrilling offer.",
          "The turnaround was fast. Within about six years CDs were outselling LPs, and by the early nineties the major labels had wound vinyl production down to almost nothing. Record shops converted their racks. Pressing plants closed, and their machines were scrapped or sold abroad.",
          "It looked like a finished story: a format invented in the 1880s, replaced by something better in almost every measurable way. For roughly fifteen years, that was the consensus.",
        ],
      },
      {
        key: "revival",
        year: "2008",
        glyph: "↻",
        title: "Records come back",
        subtitle: "The format that refused to finish dying",
        paragraphs: [
          "Record Store Day launched in 2008 as a modest attempt to get people through the doors of surviving independent shops. It landed in the middle of something larger: sales of new vinyl had quietly begun climbing, and they kept climbing, year after year, for well over a decade.",
          "In the United States, vinyl revenue passed CD revenue in 2020 for the first time since 1986, and vinyl overtook CDs in units sold shortly after. Plants that had been idle for twenty years reopened; new ones were built. Waiting lists for pressing runs stretched into months.",
          "The reasons people give are rarely about fidelity. They talk about holding the sleeve, about the ritual of dropping the needle, about a side of music being a decision you make rather than an endless feed. Vinyl came back partly because it is inconvenient in ways that turned out to be worth something.",
        ],
      },
      {
        key: "character",
        year: "Today",
        glyph: "●",
        title: "What you actually hear",
        subtitle: "Why the imperfections became the point",
        paragraphs: [
          "A record is a physical object being read by a diamond dragged through plastic at about a gram of pressure. That fact has consequences you can hear: a faint surface hiss, the occasional tick of dust, a little softening of the loudest moments, a top end that gets gentler as the needle travels toward the label.",
          "For most of the format's life those were flaws — things engineers fought to reduce with better compounds, finer styli, tighter tolerances. Digital audio removed all of them at a stroke, which was supposed to end the argument.",
          "Instead, listeners raised on flawless playback learned to hear those artifacts as warmth, as presence, as evidence that something physical is happening in the room. That is what this app reproduces: not a filter that makes things sound old, but the mechanics of a needle in a groove, applied to a song of your choosing.",
        ],
        yourRecord:
          "Switch between Original and Vinyl on the transport bar. Everything you hear change is a consequence of geometry — a spiral groove, a fixed-size tip, a platter that never spins perfectly, and a surface that was never molecularly smooth.",
      },
    ],
  },
];

/** Flat chapter list in reading order. */
export const ALL_CHAPTERS: StoryChapter[] = VINYL_STORY.flatMap((e) => e.chapters);
