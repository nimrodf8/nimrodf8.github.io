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

  function byId(id) {
    var all = KIDS.concat(PARENTS);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return KIDS[0];
  }

  global.AVATARS = { kids: KIDS, parents: PARENTS, icons: ICONS, rewardIcons: REWARD_ICONS, byId: byId };
})(window);
