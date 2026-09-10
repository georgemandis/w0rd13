// Curated five-letter word themes. Every word here is in the Wordle answer list,
// except in packs flagged `loose` in PACKS (src/game/config.ts), which may carry
// names and stylised spellings. Pack words are always accepted as guesses.
export const PACK_WORDS: Record<string, string[]> = {
  animals: "horse tiger zebra sheep goose whale shark snake mouse camel otter koala llama moose bison hyena gecko eagle raven robin finch stork crane heron quail hound puppy kitty bunny lemur sloth trout perch skunk rhino cobra viper snail geese tabby husky dingo".split(" "),
  food: "pizza pasta bread toast salad apple mango lemon peach grape melon berry cream sugar honey spice curry steak bacon onion olive basil thyme cocoa candy fudge donut bagel wafer gravy broth sauce juice cider punch mocha latte scone crepe taffy sushi ramen kebab pesto salsa chili wheat maize flour yeast dough crust icing syrup jelly crumb roast grill fried spicy sweet salty".split(" "),
  body: "heart brain liver thumb elbow wrist ankle spine skull chest belly cheek mouth teeth tooth nerve blood thigh torso waist scalp femur pupil joint flesh sweat beard voice pulse".split(" "),
  music: "piano flute banjo cello organ chord tempo lyric rhyme verse choir opera disco dance chant sound voice tenor radio vinyl album track stage music swing waltz polka tango salsa bugle viola pitch scale major minor sharp forte march intro".split(" "),
  nature: "storm cloud sunny windy frost flood ocean river beach coast shore cliff ridge marsh swamp field grove earth stone sandy dusty humid foggy snowy solar lunar comet orbit creek brook delta bluff glade heath mossy trunk leafy bloom petal thorn shrub plain steep".split(" "),
  colours: "black white green brown amber coral ivory ebony khaki lilac mauve olive peach rusty sepia azure cream lemon rouge slate ashen tawny sandy ruddy pearl smoky hazel plaid".split(" "),
  // Every word comes from a Prince song or album title (no lyrics): Let's Go Crazy, Raspberry Beret, Cream,
  // Partyup, Batdance, One Nite Alone, The Most Beautiful Girl in the World, Money Don't Matter 2 Night,
  // Condition of the Heart, Musicology, Peach, Dirty Mind, The Morning Papers, The Holy River, Black Sweat,
  // Chaos and Disorder, Planet Earth, Trust, Lemon Crush, New Power Generation, Round and Round, Blue Light,
  // Sweet Baby, We March, Right the Wrong, White Mansion, Mr. Happy, Curious Child, Slave, Style, Sleep Around,
  // Something in the Water, Adore, Hot Thing, The Cross, Electric Chair, Still Would Stand All Time,
  // I Would Die 4 U, I Wanna Be Your Lover, Dream Factory, Diamonds and Pearls, On the Couch, Clouds, Space,
  // Loose!, The Human Body, Why You Wanna Treat Me So Bad?, Thieves in the Temple, Betcha by Golly Wow,
  // When Doves Cry, Girls & Boys, Sign o' the Times, I Wanna Be Your Lover, Gotta Broken Heart Again,
  // It's Gonna Be Lonely. Names: Darling Nikki, Vicki Waiting, Bambi, Annie Christian, Billy Jack Bitch,
  // Christopher Tracy's Parade, Lion of Judah, The Arms of Orion, Venus de Milo. Prince spellings:
  // I Would Die 4 U (die4u), Fallinlove2nite (2nite), 4Ever (4ever), Emale (emale).
  purple: "crazy beret cream party dance alone world night heart music peach dirty money paper river black sweat chaos earth trust lemon crush power round light sweet march right wrong white happy child slave style sleep water adore thing cross chair stand still would lover dream pearl couch cloud space loose human treat thief golly doves girls times wanna gotta gonna nikki vicki bambi annie billy tracy judah orion venus die4u 2nite 4ever emale".split(" "),
};
