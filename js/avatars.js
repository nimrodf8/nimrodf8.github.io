/* Character list for profile pictures.
   Every avatar is an emoji on a coloured disc drawn by CSS — nothing is
   downloaded and no artwork is copied, so the family can pick freely.

   The colour comes from the position in the list, so two children who pick
   neighbouring characters still get discs that tell them apart at a glance. */
(function (global) {
  "use strict";

  var HUES = ["#ff6b6b", "#ff922b", "#fcc419", "#51cf66", "#20c997",
              "#22b8cf", "#4dabf7", "#5c7cfa", "#845ef7", "#e64980"];

  function make(list, prefix) {
    return list.map(function (emoji, i) {
      return { id: prefix + (i + 1), emoji: emoji, color: HUES[i % HUES.length] };
    });
  }

  /* Kept in a stable order: ids are position-based, so new characters go at
     the end and nobody's avatar changes underneath them. */
  var KIDS = make([
    // the classics
    "🦊", "🐼", "🦁", "🐯", "🐨", "🐸", "🦄", "🐙", "🐳", "🦖",
    "🐝", "🦉", "🐢", "🦋", "🐧", "🦔", "🐰", "🐶", "🐱", "🐵",
    "🤖", "👾", "🚀", "🌟", "🌈", "🍀", "🐲", "🦕", "🐬", "🦩",
    "🦜", "🐞", "🦭", "🐺", "🦥", "🐷",
    // more animals
    "🐮", "🐭", "🐹", "🐻", "🦝", "🦡", "🦫", "🦦", "🦘", "🦙",
    "🦌", "🐴", "🦓", "🦒", "🐘", "🦏", "🦛", "🐑", "🐐", "🐓",
    "🐣", "🦆", "🦢", "🦚", "🕊️", "🦅", "🦇", "🐗", "🐿️", "🦈",
    "🐡", "🦑", "🦐", "🦀", "🐊", "🐍", "🦎", "🐌", "🐜", "🦗",
    // creatures and heroes
    "👽", "🦸", "🦹", "🧙", "🧚", "🧜", "🧝", "🧞", "🥷", "🤠",
    "👻", "🎃", "⛄", "🛸",
    // things to be
    "⚽", "🏀", "🎾", "🎸", "🥁", "🎨", "🎭", "🎬", "📚", "🎯",
    "🚲", "🛹", "🎢", "🏆", "🌵", "🍄", "🌻", "🌊", "⚡", "🔥",
    "💎", "🌙", "☀️", "🍿", "🧁", "🍉", "🍭", "🐾"
  ], "k");

  var PARENTS = make([
    "👩", "👨", "🧑", "👩‍🦰", "👨‍🦰", "👩‍🦱", "👨‍🦱", "👵", "👴", "🧔",
    "👩‍🦳", "👨‍🦳",
    // added later, so they sit after the originals
    "👱", "👳", "👲", "🧕", "👮", "💂", "👷", "🤴", "👸", "🥷",
    "🧙", "🦸", "🦹", "🧑‍🚀", "🧑‍🍳", "🧑‍🌾", "🧑‍🏫", "🧑‍🔧", "🧑‍🎨", "🧑‍⚕️",
    "🎅", "🤶", "🐻", "🦁", "🦊", "🐨"
  ], "p");

  var ICONS = ["🧽", "🧺", "📚", "🎲", "🇳🇱", "⭐", "🛏️", "🍽️", "🦷", "🐕",
               "🌱", "🎨", "🎵", "⚽", "🧹", "🚲", "💧", "🧦", "📝", "🧩"];

  var REWARD_ICONS = ["🎁", "🎮", "🍦", "🌙", "🍽️", "🧑‍🤝‍🧑", "🍕", "🎬", "🎡", "🍭",
                      "🏊", "🎳", "🛝", "🚲", "📱", "🎧", "🧁", "🍿", "🐾", "🏕️",
                      "🎨", "⚽", "🎯", "🛼", "🧸", "💶"];

  /* ---- a colour of one's own ----
     Each child carries a colour through the whole app: the ring round their
     character, their card, their progress bar. It is what tells a six-year-old
     which row is theirs before they can read the name on it.

     Chosen to hold up on both the light and the dark background, and to stay
     apart from each other for the commonest colour-blindness — neighbours in
     the list differ in lightness as well as hue. */
  var TONES = [
    { id: "c1",  hex: "#e2564a", key: "colour.red" },
    { id: "c2",  hex: "#ef7c1b", key: "colour.orange" },
    { id: "c3",  hex: "#c79400", key: "colour.amber" },
    { id: "c4",  hex: "#4aa259", key: "colour.green" },
    { id: "c5",  hex: "#12a396", key: "colour.teal" },
    { id: "c6",  hex: "#3089d4", key: "colour.blue" },
    { id: "c7",  hex: "#5f6ff0", key: "colour.indigo" },
    { id: "c8",  hex: "#9059ea", key: "colour.violet" },
    { id: "c9",  hex: "#c44bb2", key: "colour.magenta" },
    { id: "c10", hex: "#e05580", key: "colour.pink" }
  ];

  /* Accepts an id ("c4") or a bare hex, so a colour saved by an older version
     of the app keeps working. */
  function toneHex(value) {
    if (!value) return null;
    for (var i = 0; i < TONES.length; i++) if (TONES[i].id === value) return TONES[i].hex;
    return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  }

  function byId(id) {
    var all = KIDS.concat(PARENTS);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return KIDS[0];
  }

  global.AVATARS = { kids: KIDS, parents: PARENTS, icons: ICONS, rewardIcons: REWARD_ICONS,
                     byId: byId, tones: TONES, toneHex: toneHex };
})(window);
