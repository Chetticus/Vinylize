/**
 * The Story of Vinyl — editorial content for the story tab.
 *
 * Structure: prologue, five acts holding ten chapters, epilogue. Every
 * section keeps the same four-beat rhythm — the moment (a human scene),
 * what changed (the historical idea), hear the difference (an audio
 * demonstration), explore the object (an interaction in the 3D room).
 *
 * EDITORIAL RULE, and the reason several beats read cautiously: the "hear"
 * and "explore" beats may only describe things this build actually does.
 * Audited against the implementation —
 *
 *   verified true : platter turns at exactly 33 1/3 rpm (grooveMath.OMEGA);
 *                   the tonearm angle is solved from the playback position;
 *                   groove geometry is generated from the uploaded audio
 *                   (pipeline.build_geometry + the retained detail arrays);
 *                   groove pitch, radius and turn count are true scale;
 *                   clicks are scattered over arc length and mapped to time
 *                   through the spiral, so their rate follows groove speed;
 *                   clicking the groove seeks playback.
 *   deliberately   : audio modulation in the 3D view is magnified and
 *   exaggerated      labelled on screen; the shipped effect amounts are a
 *                    "worn favourite" preset, louder than measured realism.
 *   NOT available  : per-effect toggles, 78/45 rpm playback, cylinder vs
 *                    disc comparison, stamper/pressing animation, a format
 *                    timeline, a sleeve, or a scratching demonstration.
 *
 * Do not add copy promising any of the unavailable items without building
 * them first. Sources are attached per chapter and surfaced quietly.
 */

/** Tabs a story action can send the reader to. */
export type ActionTarget = "compare" | "groove" | "waveform";

export interface StoryAction {
  label: string;
  target: ActionTarget;
}

export interface StorySource {
  label: string;
  url: string;
}

export interface StoryBeat {
  text: string;
  action?: StoryAction;
}

export interface StoryChapter {
  /** Stable id — also the deep-link key used by the sidebar. */
  key: string;
  kind: "prologue" | "chapter" | "epilogue";
  /** Rail/pill label: "Prologue", "Chapter 3", "Epilogue". */
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
  sources?: StorySource[];
}

export interface StoryAct {
  label: string;
  chapters: StoryChapter[];
}

const LOC_TIMELINE: StorySource = {
  label: "Library of Congress — recorded-sound timeline",
  url: "https://www.loc.gov/programs/national-recording-preservation-plan/tools-and-resources/historical-background/timeline/",
};

export const VINYL_STORY: StoryAct[] = [
  {
    label: "Prologue",
    chapters: [
      {
        key: "prologue",
        kind: "prologue",
        label: "Prologue",
        glyph: "◉",
        title: "The Needle Drops",
        subtitle: "With vinyl, the medium is never completely hidden",
        moment: [
          "A motor comes up to speed. The platter settles at thirty-three and a third revolutions per minute. The arm moves inward, pauses, and lowers. Before the music arrives, you hear something else: a soft rush, perhaps a tick.",
          "That brief sound is the record, the stylus, and the playback system revealing themselves. With vinyl, the medium is never completely hidden.",
        ],
        whatChanged: [
          "A modern record holds sound in one continuous spiral groove. Its movements are microscopic, yet they can carry the shape of a voice, the strike of a drum, and the space around a performance.",
          "How can a physical groove give all of that back on demand?",
          "The answer took more than a century of experiments — and eventually changed not only how music was stored, but how it was written, sold, shared, collected, and performed.",
        ],
        hear: {
          text: "Listen to the lead-in before the song begins. Vinylize cuts six seconds of silence into the groove ahead of your music, so anything audible in that gap comes from the simulated surface: noise, rumble and dust rather than your recording.",
          action: { label: "⇄ Listen to the lead-in", target: "compare" },
        },
        explore: {
          text: "Follow the stylus as it settles near the outer edge and travels slowly inward. The platter turns at a true 33⅓ rpm against the audio clock, and the arm's angle is solved from the current playback position rather than animated.",
          action: { label: "◎ Open the 3D room", target: "groove" },
        },
      },
    ],
  },
  {
    label: "Act I — Wonder and Invention",
    chapters: [
      {
        key: "before",
        kind: "chapter",
        label: "Chapter 1",
        glyph: "◌",
        title: "Before Music Could Be Kept",
        subtitle: "A world where performances could be remembered, but not replayed",
        moment: [
          "Imagine hearing a remarkable singer in 1850. You could describe the performance, write down the melody, or learn to perform it yourself. What you could not preserve was that particular voice in that particular room on that particular day.",
          "Music notation could save a composition. It could not save an acoustic event.",
        ],
        whatChanged: [
          "Photography had shown that a fleeting image could be fixed to a surface. Inventors began asking whether sound could be captured too.",
          "In 1857, French printer and inventor Édouard-Léon Scott de Martinville patented the phonautograph. A vibrating membrane moved a stylus that traced sound waves onto a soot-darkened surface. The machine was designed to make sound visible, not to play it back.",
          "More than a century later, researchers used optical scanning and computers to recover sound from surviving phonautograms. Scott had preserved traces that people in his lifetime had no way to hear again.",
        ],
        hear: {
          text: "There is no playback button in this part of the story. The phonautograph could inscribe sound, but it could not mechanically reproduce it.",
        },
        explore: {
          text: "Zoom into the magnified groove view. Vinylize has no phonautogram to show beside it, but the wavy line in the groove wall is generated from your uploaded audio and rests on the same insight Scott had: vibration can leave a readable pattern on a surface.",
          action: { label: "◎ See the pattern", target: "groove" },
        },
        sources: [LOC_TIMELINE],
      },
      {
        key: "first-sounds",
        kind: "chapter",
        label: "Chapter 2",
        glyph: "◎",
        title: "The First Sounds Played Back",
        subtitle: "A machine repeats a human voice",
        moment: [
          "Menlo Park, New Jersey, late 1877. Thomas Edison speaks into a machine built around a cylinder wrapped in tinfoil. A stylus presses the vibrations of his voice into the foil. When the cylinder is returned to the beginning, the machine plays the sound back.",
          "“Mary Had a Little Lamb” is traditionally reported as the first test. Whether every detail of the familiar story happened exactly as later retellings describe, the achievement was real: a device had recorded and reproduced sound.",
        ],
        whatChanged: [
          "The principle was direct. Sound moves a diaphragm. The diaphragm moves a stylus. The stylus inscribes a changing path. During playback, following that path sets the system vibrating again.",
          "Tinfoil demonstrated the idea but was too fragile and awkward for everyday use. During the 1880s, work by the Volta Laboratory and Edison helped establish wax cylinders as a more practical medium. Recorded voices and music could now be replayed, sold, collected, and heard far from the original performance.",
        ],
        hear: {
          text: "Early recordings sound narrow, noisy, and distant to modern ears. That noise is not one single “vinyl effect”; it reflects the materials, recording method, playback equipment, age, and condition of each object. Vinylize models a modern LP played on a worn setup — an interpretation, not a reproduction of any particular era.",
          action: { label: "⇄ Hear the interpretation", target: "compare" },
        },
        explore: {
          text: "Zoom until a single groove wall fills the screen and watch how its shape follows the music. Vinylize renders discs only; it does not simulate a cylinder.",
          action: { label: "◎ Zoom into the wall", target: "groove" },
        },
        sources: [
          {
            label: "Library of Congress — History of the Cylinder Phonograph",
            url: "https://www.loc.gov/collections/edison-company-motion-pictures-and-sound-recordings/articles-and-essays/history-of-edison-sound-recordings/history-of-the-cylinder-phonograph/",
          },
        ],
      },
      {
        key: "discs",
        kind: "chapter",
        label: "Chapter 3",
        glyph: "◍",
        title: "From Cylinders to Discs",
        subtitle: "The shape that helped recorded music become an industry",
        moment: [
          "Early cylinders were difficult to reproduce in large numbers. Performers sometimes repeated a piece several times, or recorded into several machines at once, to create more originals.",
          "Emile Berliner pursued a different shape: a flat disc.",
        ],
        whatChanged: [
          "Berliner patented his gramophone system in 1887 and soon replaced its experimental cylinder with a disc. Flat masters could be developed into stampers, making it easier to press many copies of the same recording. Discs were also convenient to stack, package, label, and distribute.",
          "By the early twentieth century, discs were overtaking cylinders. Many commercial records used compounds in which shellac served as a binder alongside mineral fillers and other ingredients. Playback speeds varied at first, then settled around 78 rpm during the 1920s.",
          "A typical ten-inch 78 held only a few minutes per side. That limit encouraged compact arrangements and helped reinforce the short song as a commercial unit — but it was one influence among many, not the sole reason popular songs have the lengths they do.",
        ],
        hear: {
          text: "Vinylize models one format: a 33⅓ rpm microgroove LP. The coarser surface and narrower bandwidth of a shellac 78 belong to a different object, and this build does not attempt to reproduce them.",
        },
        explore: {
          text: "Pull back in the 3D room to see the whole side at once — a single continuous spiral running from the lead-in at the rim to the run-out near the label.",
          action: { label: "◎ See the whole spiral", target: "groove" },
        },
        sources: [
          {
            label: "Library of Congress — Emile Berliner and the Gramophone",
            url: "https://www.loc.gov/collections/emile-berliner/articles-and-essays/gramophone/",
          },
        ],
      },
    ],
  },
  {
    label: "Act II — The Record Becomes Culture",
    chapters: [
      {
        key: "modern-vinyl",
        kind: "chapter",
        label: "Chapter 4",
        glyph: "33",
        title: "The Birth of the Modern LP",
        subtitle: "Two new formats reshape the album and the single",
        moment: [
          "On June 21, 1948, Columbia Records introduced its long-playing record at a New York press conference. A twelve-inch disc spinning at 33⅓ rpm could hold roughly twenty-three minutes per side — several times the playing time of a conventional 78.",
          "The extra space changed what a record could be.",
        ],
        whatChanged: [
          "The successful LP combined several earlier ideas: slower rotation, vinyl material, and a much finer microgroove. Peter Goldmark oversaw the Columbia project, with Bill Bachman and a larger engineering team playing important roles in bringing the system to market.",
          "RCA Victor answered in 1949 with the seven-inch 45 rpm record and an automatic changer. Consumers briefly faced three competing speeds: 78, 33⅓, and 45. The newer formats eventually found different strengths. LPs became closely associated with albums and longer works, while 45s became central to singles, jukeboxes, radio promotion, and pop culture.",
          "The word “album” had previously described a bound collection of 78s in paper sleeves. With the LP, an album increasingly became a continuous, sequenced work on one disc.",
        ],
        explore: {
          text: "Your upload is cut in this format: 33⅓ rpm, a 0.25 mm groove pitch, laid into a twelve-inch disc at true radius. Vinylize does not currently offer 78 or 45 rpm playback, so the speed comparison stays a matter of description rather than demonstration.",
          action: { label: "◎ Inspect your microgroove", target: "groove" },
        },
        sources: [
          {
            label: "Library of Congress — The First Long-Playing Disc",
            url: "https://blogs.loc.gov/now-see-hear/2019/04/inside-the-archival-box-the-first-long-playing-disc/",
          },
        ],
      },
      {
        key: "golden-age",
        kind: "chapter",
        label: "Chapter 5",
        glyph: "❏",
        title: "The Golden Age of the Record",
        subtitle: "When a storage format became an identity",
        moment: [
          "Enter a mid-century record shop. Sleeves fill the racks. A listening booth offers a first encounter with an unfamiliar album. Nearby, a jukebox turns a row of 45s into a public argument about what everyone should hear next.",
          "Finding music is becoming a social ritual.",
        ],
        whatChanged: [
          "The twelve-inch sleeve gave music a large visual surface. Cover art, photography, typography, liner notes, and gatefold designs became part of the work. A record could tell you who performed, who produced, where it was recorded, and how the artist wanted the music to be seen.",
          "Collections made taste visible. Records were saved for, borrowed, traded, carried to parties, and played for friends. Record shops, radio stations, fan communities, jukeboxes, and clubs all became places where music and identity met.",
          "The object also carried less visible evidence of its manufacture. In the run-out area — often called the dead wax — engineers and pressing plants inscribed matrix numbers and other markings. Some records also contain initials, messages, or jokes left by the people who cut them.",
        ],
        explore: {
          text: "Orbit the record to see its label, which carries your uploaded file's name, and the wide run-out spiral near the centre. Vinylize renders the disc, label and run-out; it does not render a sleeve or inscribe matrix markings.",
          action: { label: "◎ Look at the label", target: "groove" },
        },
      },
    ],
  },
  {
    label: "Act III — Inside the Object",
    chapters: [
      {
        key: "inside-groove",
        kind: "chapter",
        label: "Chapter 6",
        glyph: "⌇",
        title: "Inside the Groove",
        subtitle: "How movement in plastic becomes music in a room",
        moment: [
          "Pause the timeline and move closer. A record side contains one continuous spiral, often extending for hundreds of metres if it could be uncoiled. The groove does not have one fixed width or spacing: its shape and pitch change with the program, level, duration, and decisions made during cutting.",
          "Its walls move.",
        ],
        whatChanged: [
          "During mastering, a cutting head converts an electrical audio signal into motion and inscribes a modulated spiral into a master surface. That master is processed through several stages to create the metal stampers used to press finished records.",
          "During playback, a stylus follows the groove and moves a cantilever inside the cartridge. Different cartridge designs turn that motion into a small electrical signal in different ways. A phono preamplifier applies the required equalization and raises the signal; an amplifier and loudspeaker then turn it back into moving air.",
          "Stereo records use two groove walls angled at 45 degrees to carry combinations of the left and right channels. The stylus therefore moves both sideways and vertically as it follows the music.",
          "The physical system also explains many familiar problems. Dust or damage can produce clicks. A scratch may repeat once per revolution. Severe damage or poor setup can throw the stylus into another part of the groove, causing a skip. Contact playback can gradually wear both record and stylus, especially when equipment is misadjusted or surfaces are dirty.",
        ],
        hear: {
          text: "Vinylize scatters its dust and defects along the groove's physical length rather than evenly in time, then maps them back through the spiral — so how often you hear a tick depends on how fast the disc is passing the stylus. Repeating scratches, warps and skips are not modelled in this build.",
          action: { label: "⇄ Listen for the ticks", target: "compare" },
        },
        explore: {
          text: "Zoom to the magnified view. The V-shaped trench is generated from your own audio's groove signal at true pitch and radius, with the stylus resting in it. The audio modulation itself is magnified for visibility, and the on-screen label states the factor.",
          action: { label: "◎ Enter the microscope", target: "groove" },
        },
        sources: [
          { label: "Ortofon — mono and stereo groove geometry", url: "https://ortofon.com/pages/what-is-mono" },
          { label: "Ortofon — how a moving-magnet cartridge works", url: "https://ortofon.com/pages/what-is-moving-magnet" },
        ],
      },
      {
        key: "why-sounds",
        kind: "chapter",
        label: "Chapter 7",
        glyph: "≈",
        title: "Why Vinyl Sounds Like Vinyl",
        subtitle: "There is no single “vinyl sound”",
        moment: [
          "Ask listeners why they enjoy records and one word appears often: warm. It can describe a genuine listening experience, but it is not one measurable property shared by every record.",
          "The record, the mastering choices, the turntable, the cartridge, the phono stage, the speakers, the room, and the listener all take part.",
        ],
        whatChanged: [
          "Vinyl has physical constraints. Very deep or out-of-phase bass can require adjustment because it demands large or difficult groove movement. High-frequency and highly sibilant material can be challenging to track cleanly. As the stylus moves inward, the groove travels past it at a lower linear speed, increasing the risk of inner-groove distortion.",
          "Records also use standardized equalization. During cutting, low frequencies are reduced and high frequencies are boosted; the phono preamp applies the complementary curve during playback. This makes grooves more practical and helps reduce audible surface noise.",
          "Surface noise, small speed variations, distortion, and the coloration of the playback chain can all contribute to what a listener calls warmth. So can mastering: a vinyl release and a streaming release may use different masters. Neither format guarantees more or less dynamic range simply by existing.",
          "Then there is attention. Choosing a record, placing it on the platter, and listening through a side can change how someone engages with the music. That is a real part of the experience, even though it is not an audio specification.",
        ],
        hear: {
          text: "Switch between the original and the Vinylize treatment. The differences come from modelled processes — RIAA equalization, stylus tracing loss, groove-wall saturation, wow and flutter, dust, surface noise and channel crosstalk — applied together at deliberately exaggerated amounts so they stay audible on laptop speakers.",
          action: { label: "⇄ Compare the two", target: "compare" },
        },
        explore: {
          text: "This build applies those effects as one combined treatment and does not expose per-effect switches, so treat the comparison as the sum of them rather than a demonstration of any single characteristic.",
        },
      },
    ],
  },
  {
    label: "Act IV — Reinvention and Displacement",
    chapters: [
      {
        key: "changes-music",
        kind: "chapter",
        label: "Chapter 8",
        glyph: "⟲",
        title: "When the Record Became an Instrument",
        subtitle: "Playback turns into performance",
        moment: [
          "At a back-to-school party in the Bronx in 1973, DJ Kool Herc used two turntables to extend the instrumental breaks that energized the dancers. The event is widely commemorated as a foundational moment in hip-hop — not the creation of a culture from nothing, but a moment when existing Black, Latino, Caribbean, sound-system, dance, and spoken-word traditions came together in a powerful new form.",
          "The record was no longer only something to hear. It was something to perform.",
        ],
        whatChanged: [
          "Grandmaster Flash refined precise cueing and mixing techniques. Grand Wizzard Theodore is credited as the primary innovator of scratching, moving a record rhythmically beneath the stylus. DJs transformed turntables, mixers, and existing recordings into a new instrument.",
          "That change reached far beyond one technique. Turntablism, sampling, hip-hop production, disco, house, techno, remix culture, and crate digging all developed distinct relationships with recorded sound. Their histories are not identical, but each demonstrates that a recording can become material for another creative act.",
        ],
        explore: {
          text: "Click anywhere on the groove to move the stylus to that point in the track. It is a seek control built on the spiral's geometry — useful for inspection, but nothing like the precision of a DJ cueing by hand. Vinylize has no looping, backspin or scratching.",
          action: { label: "◎ Move the stylus", target: "groove" },
        },
        sources: [
          {
            label: "Library of Congress — Kool Herc and the 1973 back-to-school jam",
            url: "https://blogs.loc.gov/loc/2021/01/citizen-dj-noah-webster-and-the-value-of-copyright/",
          },
          {
            label: "Smithsonian — Grand Wizzard Theodore's turntables",
            url: "https://music.si.edu/story/grand-wizzard-theodores-turntables-smithsonian-year-music-object-day-august-13",
          },
        ],
      },
      {
        key: "digital",
        kind: "chapter",
        label: "Chapter 9",
        glyph: "◇",
        title: "The Rise of Digital",
        subtitle: "Convenience changes the centre of listening",
        moment: [
          "Vinyl was not replaced in a single step. The compact cassette, introduced by Philips in 1963, made recording and portability easier. Sony's Walkman, launched in 1979, made private listening part of everyday movement.",
          "Then came the compact disc.",
        ],
        whatChanged: [
          "Sony and Philips jointly developed the CD system, and the first commercial players and discs arrived in 1982. Because a laser reads the disc without riding in an audio groove, normal playback does not gradually wear the recording surface. CDs offered low background noise, quick track access, long playing time, and a smaller package. They could still be scratched or skip, but they removed many of vinyl's everyday inconveniences.",
          "By the late 1980s, CDs had overtaken LPs in major markets. Vinyl became a specialist format; pressing plants closed, and many stores reduced or removed their record sections.",
          "MP3 compression then made audio files small enough for practical online exchange. Downloads and file sharing separated the recording from a physical carrier, while streaming made vast catalogues available on demand.",
          "Each format changed the balance between access, ownership, portability, and ritual. Digital listening did not destroy attention, and physical listening does not guarantee it — but the tools encourage different habits.",
        ],
        hear: {
          text: "Compare the modelled surface noise and speed variation against the clean original. Keep in mind that when two real releases sound different, the cause is often a mastering decision rather than the storage format itself.",
          action: { label: "⇄ Compare clean and coloured", target: "compare" },
        },
        sources: [
          {
            label: "Sony — joint development and 1982 launch of the compact disc",
            url: "https://www.sony.com/en/SonyInfo/CorporateInfo/History/SonyHistory/2-07.html",
          },
        ],
      },
    ],
  },
  {
    label: "Act V — The Return",
    chapters: [
      {
        key: "refused",
        kind: "chapter",
        label: "Chapter 10",
        glyph: "↻",
        title: "The Record That Refused to Disappear",
        subtitle: "Why an old format found new listeners",
        moment: [
          "Vinyl never vanished completely. DJs, collectors, audiophiles, independent labels, punk and dance scenes, specialist shops, and committed pressing plants kept the format alive during the CD era.",
          "The movement now known as Record Store Day began in 2007, with its first main event held in 2008. It gave independent shops a shared celebration just as vinyl sales were beginning a long climb.",
        ],
        whatChanged: [
          "In the United States, vinyl revenue surpassed CD revenue in 2020 for the first time since 1986. In 2022, vinyl albums also surpassed CDs in units for the first time since 1987. Those are U.S. industry measurements, not universal claims about every country, but they show that the revival became commercially significant.",
          "Listeners returned for different reasons: artwork, collecting, ownership, sound, nostalgia, artist support, and the ritual of choosing one side at a time. New plants opened and old equipment returned to service.",
          "The revival also has costs. Records are commonly made from PVC; pressing, electroplating, packaging, and shipping all use materials and energy. Recycled compounds, lower-impact packaging, and cleaner manufacturing may reduce some burdens, but “physical” does not automatically mean sustainable.",
        ],
        explore: {
          text: "Inspect the run-out area and label in the 3D room, then weigh that object against what Vinylize actually is — a digital interpretation of the ritual, with none of the material cost and none of the physical presence.",
          action: { label: "◎ Inspect the run-out", target: "groove" },
        },
        sources: [
          {
            label: "RIAA — 2020 year-end revenue report",
            url: "https://www.riaa.com/wp-content/uploads/2021/02/2020-Year-End-Music-Industry-Revenue-Report.pdf",
          },
          {
            label: "RIAA — 2022 year-end revenue report",
            url: "https://www.riaa.com/wp-content/uploads/2023/03/2022-Year-End-Music-Industry-Revenue-Report.pdf",
          },
          {
            label: "European Commission — publication on PVC and the environment",
            url: "https://op.europa.eu/en/publication-detail/-/publication/e9e7684a-906b-11ec-b4e4-01aa75ed71a1",
          },
        ],
      },
    ],
  },
  {
    label: "Epilogue",
    chapters: [
      {
        key: "epilogue",
        kind: "epilogue",
        label: "Epilogue",
        glyph: "●",
        title: "Bringing the Ritual Into the Digital World",
        subtitle: "A simulated effect is inspired by a physical process, not identical to one",
        moment: [
          "Back in the room, the platter turns and the arm moves inward. The song is digital, but the scene asks you to slow down and notice it.",
        ],
        whatChanged: [
          "Digital listening gave us extraordinary access: enormous catalogues, immediate playback, portability, and powerful tools for discovery. Vinyl offers a different set of qualities: a physical object, visible artwork, mechanical playback, finite sides, and a deliberate sequence of actions.",
          "Vinylize does not need to pretend that one is superior to the other. Its opportunity is to bring selected elements of the vinyl experience into a digital space: visible motion, intentional listening, historical context, and a controllable layer of vinyl-inspired sound.",
          "The comparison should remain honest. A simulated effect is inspired by a physical process; it is not the same as pressing a record. This build lets you hear the treatment as a whole and see the groove it came from — and separating the individual elements, so curiosity can replace nostalgia, is still work left to do.",
        ],
        hear: {
          text: "Switch between the original and the Vinylize treatment one final time. This time, listen for the individual elements by name and decide what each one contributes.",
          action: { label: "⇄ One final comparison", target: "compare" },
        },
        question: "If every song is one tap away, what makes us stop and truly listen?",
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
