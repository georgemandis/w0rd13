// Curated five-letter word themes. Every word here is in the five-letter answer list,
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
  sports: "pitch match score coach rally serve swing catch throw punch judge medal track field court glove skate climb relay bench squad arena derby champ cycle kayak vault rugby scrum drive title crown final fault smash lunge canoe chess boxer skier slide slope pedal cleat racer torch flame sport".split(" "),
  // Loose pack: planets and moons are names.
  space: "orbit comet solar lunar earth probe alien titan light flare dwarf giant craft space rover radar world globe cloud storm night blast pluto venus orion ceres vesta".split(" "),
  spooky: "ghost witch ghoul demon devil skull grave crypt curse haunt eerie creep scary spook blood candy treat trick mummy broom raven black night cloak spell scare shock crawl blaze fiend beast swamp dread panic gloom".split(" "),
  weather: "storm cloud sunny windy frost flood humid foggy snowy rainy sleet gusty balmy chill blaze drift blast flash shade dusty smoky polar clear gloom spray swirl tepid front glaze crisp".split(" "),
  jobs: "nurse judge pilot baker clerk actor coach guard mayor medic tutor miner diver agent scout valet usher cadet envoy rabbi nanny mason clown chief model guide maker crook thief ninja queen smith vicar boxer racer baron count".split(" "),
  games: "chess poker bingo board token piece queen score level joker spade heart trump wager bluff raise check tarot dealt deuce flush royal crazy eight snake loser champ bonus round party prize stake".split(" "),
  ocean: "whale shark coral ocean beach shore tidal otter diver pearl shell sandy salty spray storm yacht canoe kayak depth abyss swell wharf coast cliff jetty algae trout perch conch ferry foamy briny".split(" "),
  feelings: "happy angry sadly eager proud timid jolly giddy moody tense weary upset scary merry sorry guilt shame pride bliss grief dread panic peace worry fancy crush adore amuse angst cheer spite mercy sulky rowdy jumpy gloom elate manic sappy mushy".split(" "),
  tech: "cache mouse click email pixel login virus robot macro modem patch debug array stack queue index query table field input print paste cloud phone audio video radio cable admin unzip mount shell apple crash error fatal proxy token tweet touch panel".split(" "),
  fashion: "dress skirt shirt scarf tweed denim linen satin silky khaki cloak beret crown tiara pleat plaid style vogue model tunic frock shawl apron glove purse cameo brand label fancy sassy retro pearl chain badge weave".split(" "),
  home: "house porch attic patio floor table chair couch shelf stove fence brick paint hinge latch foyer stool bench quilt duvet sheet towel broom cabin condo villa igloo manor hotel motel lodge ranch vault tower hedge study suite lobby decor plant".split(" "),
  drinks: "mocha latte cider juice water vodka cocoa punch shake float tonic lager stout cream sugar lemon straw glass drink toast round draft booze fizzy froth sober tipsy merry crisp chill olive".split(" "),
  // Loose pack built from Taylor Swift song and album titles: Style, Lover, Karma, Clean, Dress, Shake It Off,
  // Blank Space, Exile, ...Ready for It?, Don't Blame Me, Bad Blood, I Wish You Would, State of Grace, The Lucky One,
  // Begin Again, Speak Now, Love Story, White Horse, You're Not Sorry, A Place in This World, Tied Together with a
  // Smile, No Body No Crime, Long Story Short, Mad Woman, Peace, Snow on the Beach, Sweet Nothing, But Daddy I Love
  // Him, Fresh Out the Slammer, I Can Do It with a Broken Heart, Cruel Summer, Paper Rings, Seven, Betty, James,
  // Peter, Robin, Clara Bow, Paris.
  swift: "style lover karma clean dress shake blank exile ready blame blood would grace lucky begin speak story white horse sorry place world smile crime short woman peace beach sweet daddy fresh heart cruel paper seven betty james peter robin clara paris".split(" "),
};
