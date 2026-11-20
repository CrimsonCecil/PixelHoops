// Listed height (in), weight (lb): ESPN NBA team rosters, 2026-11-19.
// https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/lal/roster (substitute team)
// Legends: ESPN athlete profiles (Kobe: 110, Shaq: 614).
// Wingspan and hand length (in): https://github.com/sdhutchins/nba-draft-combine-anthro/blob/master/data/anthro_data.csv
// * marks an approximate, commonly reported scouting wingspan, not a combine record.
// Blank wingspan/hand fields leave the visual model to use its default.
window.PH = window.PH || {};
window.PH.measurements = {
  ablack: [79, 200, 79.5, 8.25], // Anthony Black
  ace: [81, 200, 84.5, 8.5], // Ace Bailey
  achiuwa: [80, 243, 84.75, 9], // Precious Achiuwa
  acuff: [74, 186, 78.5, 8.5], // Darius Acuff Jr.
  ad: [82, 253, 89.5, 9], // Anthony Davis
  ajay: [76, 190, 78.25, 8.5], // Ajay Mitchell
  ajgreen: [76, 190], // AJ Green
  amen: [79, 200, 84, 8.5], // Amen Thompson
  ament: [82, 211], // Nate Ament
  ausar: [79, 205, 84, 8.75], // Ausar Thompson
  avdija: [80, 228, 81], // Deni Avdija *
  awiggins: [77, 190, 81.75, 8.75], // Aaron Wiggins
  ayton: [84, 252, 89.5], // Deandre Ayton *
  bagley: [82, 235], // Marvin Bagley III
  bam: [81, 260, 86.75], // Bam Adebayo *
  bamba: [84, 231, 94], // Mo Bamba *
  banchero: [82, 250, 85], // Paolo Banchero *
  bane: [78, 215, 76.75], // Desmond Bane *
  barnes: [80, 237, 86.75, 9.25], // Scottie Barnes
  barrett: [78, 214, 82], // RJ Barrett *
  battle: [79, 220], // Jamison Battle
  beal: [76, 207, 80, 8.5], // Bradley Beal
  beringer: [83, 230, 88.5, 9.75], // Joan Beringer
  blopez: [85, 282, 89.5], // Brook Lopez
  bmiller: [79, 200, 83], // Brandon Miller *
  bogdan: [77, 225], // Bogdan Bogdanovic
  bona: [82, 239, 87.75, 9.5], // Adem Bona
  booker: [77, 206, 80.25, 8.75], // Devin Booker
  boozer: [80, 253, 85.5, 8.75], // Cameron Boozer
  braun: [78, 220, 78.5, 8], // Christian Braun
  brazile: [82, 220, 87.75, 9], // Trevon Brazile
  bridges: [78, 209, 85], // Mikal Bridges *
  brunson: [74, 190, 76, 8.25], // Jalen Brunson
  burries: [76, 215, 78, 8.25], // Brayden Burries
  butler: [78, 230, 79.5, 9], // Jimmy Butler III
  buzelis: [80, 209, 82, 8.5], // Matas Buzelis
  cade: [78, 220, 84], // Cade Cunningham *
  camara: [79, 230, 84.5, 9], // Toumani Camara
  camjohnson: [80, 210, 82, 8], // Cameron Johnson
  camspencer: [75, 205, 77, 8.5], // Cam Spencer
  capela: [82, 256, 88.5], // Clint Capela *
  carrington: [76, 190], // Bub Carrington
  caruso: [77, 186, 80], // Alex Caruso *
  castle: [78, 220, 81, 8.75], // Stephon Castle
  cbryant: [79, 230, 83.75, 8.5], // Carter Bryant
  chet: [85, 208, 90], // Chet Holmgren *
  christie: [77, 190, 80.75, 8], // Max Christie
  cissoko: [78, 220, 81.75, 9.25], // Sidy Cissoko
  clarkson: [77, 194, 80, 8.25], // Jordan Clarkson
  claxton: [83, 215, 86], // Nic Claxton *
  clayton: [76, 195, 76, 8.25], // Walter Clayton Jr.
  clingan: [86, 280, 90.75, 10], // Donovan Clingan
  clowney: [82, 210], // Noah Clowney
  cmartin: [77, 205, 82, 8.5], // Caleb Martin
  cmb: [79, 245, 84.75, 8.5], // Collin Murray-Boyles
  collier: [76, 210, 76.75, 8.5], // Isaiah Collier
  conwell: [75, 220, 79, 8.5], // Ryan Conwell
  coulibaly: [79, 195, 86], // Bilal Coulibaly *
  coward: [77, 206, 86.25, 9.25], // Cedric Coward
  curry: [74, 185, 75.5], // Stephen Curry
  cwhite: [76, 195, 77, 7.75], // Coby White
  cwilson: [81, 211, 84.25, 9], // Caleb Wilson
  daniels: [79, 199, 82.5, 8.5], // Dyson Daniels
  dasilva: [80, 217, 82.25, 9], // Tristan da Silva
  dbrooks: [79, 225, 78, 8.25], // Dillon Brooks
  delarrea: [79, 202, 81, 8.75], // Sergio de Larrea
  demin: [80, 200, 82.25, 8.25], // Egor Demin
  derozan: [78, 220, 81], // DeMar DeRozan
  diabate: [82, 210, 86.5, 8.5], // Moussa Diabate
  djenkins: [76, 165], // Daniss Jenkins
  djj: [78, 210], // Derrick Jones Jr.
  djmurray: [76, 180, 82.5], // Dejounte Murray *
  dmitchell: [72, 210, 76.25, 8.25], // Davion Mitchell
  dort: [76, 220, 80.5, 8.5], // Luguentz Dort
  dosunmu: [76, 200, 82.25, 8.5], // Ayo Dosunmu
  dqueen: [81, 250, 84.5, 9], // Derik Queen
  draymond: [78, 230, 85.25, 9], // Draymond Green
  drobinson: [79, 215], // Duncan Robinson
  drummond: [83, 279, 90.25, 9.5], // Andre Drummond
  durant: [83, 240, 88.75], // Kevin Durant
  duren: [82, 250, 89], // Jalen Duren *
  dwade: [81, 223], // Dean Wade
  dybantsa: [81, 217, 84], // AJ Dybantsa *
  eason: [80, 215, 86, 9.25], // Tari Eason
  edey: [87, 305, 94.75, 10], // Zach Edey
  edgecombe: [77, 180, 79.5, 8.5], // VJ Edgecombe
  edwards: [76, 225, 81], // Anthony Edwards *
  ejiofor: [80, 245, 86, 9.25], // Zuby Ejiofor
  embiid: [84, 270, 90], // Joel Embiid *
  esharp: [75, 208, 75, 8], // Emanuel Sharp
  fears: [75, 190, 77.25, 8.25], // Jeremiah Fears
  flagg: [81, 205, 84, 8.75], // Cooper Flagg
  flemings: [75, 183, 75.5, 8.5], // Kingston Flemings
  fox: [75, 190, 78.5, 8.5], // De'Aaron Fox
  franz: [82, 220, 84], // Franz Wagner *
  fvv: [72, 197, 74], // Fred VanVleet *
  gafford: [82, 265, 86.25, 9.25], // Daniel Gafford
  gallen: [75, 198, 79.25, 8.25], // Grayson Allen
  garland: [73, 192, 77], // Darius Garland *
  giannis: [83, 243, 87], // Giannis Antetokounmpo *
  giddey: [79, 216, 80], // Josh Giddey *
  gillespie: [73, 195, 76, 8.25], // Collin Gillespie
  gobert: [85, 258, 92.5, 9.75], // Rudy Gobert
  goodwin: [75, 215], // Jordan Goodwin
  gordon: [80, 235, 83.75, 8.75], // Aaron Gordon
  graves: [80, 225, 84, 9], // Allen Graves
  grimes: [76, 210, 80, 8.5], // Quentin Grimes
  gsantos: [79, 185], // Gui Santos
  haliburton: [77, 185, 81], // Tyrese Haliburton *
  harden: [77, 220, 82.75], // James Harden
  harper: [77, 220, 82.5, 9.25], // Dylan Harper
  hart: [77, 215, 80.25, 8.5], // Josh Hart
  hartenstein: [84, 250], // Isaiah Hartenstein
  hauser: [80, 221, 81.25, 8.25], // Sam Hauser
  hayes: [84, 220, 87.5, 9.25], // Jaxson Hayes
  hbarnes: [80, 225, 83.25, 9], // Harrison Barnes
  herb: [79, 206, 84.25, 8.5], // Herbert Jones
  herro: [77, 205, 75.25, 8], // Tyler Herro
  hezonja: [80, 220], // Mario Hezonja
  holiday: [76, 220, 79], // Jrue Holiday
  hopkins: [79, 220, 82.5, 9.25], // Bryce Hopkins
  horford: [80, 240, 84.75], // Al Horford
  huerter: [78, 198, 79.5, 8.25], // Kevin Huerter
  huff: [85, 240], // Jay Huff
  hugo: [78, 205, 82.75, 10.25], // Hugo Gonzalez
  hunter: [79, 221], // De'Andre Hunter
  ighodaro: [83, 235, 83, 9], // Oso Ighodaro
  ijackson: [80, 205], // Isaiah Jackson
  istewart: [80, 250, 88.75, 9], // Isaiah Stewart
  jabariw: [79, 240, 82.75, 8.75], // Jabari Walker
  jakucionis: [77, 205, 79.75, 8.5], // Kasparas Jakucionis
  jalensmith: [80, 215, 86.25, 9.25], // Jalen Smith
  jallen: [81, 243, 89.25, 9.5], // Jarrett Allen
  jaquez: [78, 230, 81.5, 8.5], // Jaime Jaquez Jr.
  jarace: [79, 235, 86.5, 9], // Jarace Walker
  jase: [73, 180, 78, 8.5], // Jase Richardson
  javonte: [77, 205], // Javonte Green
  jbrown: [78, 223, 83.75, 8.75], // Jaylen Brown
  jcain: [79, 191], // Jamal Cain
  jcarter: [72, 200, 76.25, 9.25], // Jevon Carter
  jchamp: [78, 206, 81.5, 8.75], // Justin Champagnie
  jclark: [77, 205, 81, 8.5], // Jaylen Clark
  jcollins: [81, 226, 83.25, 9], // John Collins
  jdub: [77, 211, 86.25, 8.5], // Jalen Williams
  jerome: [77, 195, 76, 8.25], // Ty Jerome
  jgrant: [79, 213, 86.75, 9.25], // Jerami Grant
  jgreen: [76, 186, 79], // Jalen Green *
  jjj: [82, 242, 89.25, 10], // Jaren Jackson Jr.
  jjohnson: [80, 219, 84.25, 9.75], // Jalen Johnson
  jmurray: [76, 215, 79], // Jamal Murray *
  joe: [76, 165, 79.5, 8.25], // Isaiah Joe
  jokic: [83, 284, 87], // Nikola Jokic *
  joshgreen: [78, 200, 81.75, 8], // Josh Green
  jovic: [82, 240, 84.25, 8.75], // Nikola Jovic
  jsmall: [73, 190, 76.75, 8.25], // Javon Small
  jsmith: [83, 220, 85], // Jabari Smith Jr. *
  julianc: [79, 215, 82, 8.75], // Julian Champagnie
  jwalter: [76, 180, 82, 8.75], // Ja'Kobe Walter
  jwells: [79, 206, 79.25, 8.25], // Jaylen Wells
  kalkbrenner: [85, 256, 90, 9.25], // Ryan Kalkbrenner
  karaban: [79, 225, 83, 8.5], // Alex Karaban
  kat: [84, 248, 87.5], // Karl-Anthony Towns *
  kawhi: [78, 225, 87, 9.75], // Kawhi Leonard
  kcp: [77, 213, 80, 8.5], // Kentavious Caldwell-Pope
  kdunn: [75, 205, 81.5], // Kris Dunn
  keldon: [78, 215, 81.25, 8], // Keldon Johnson
  kellis: [76, 175, 80.5, 8], // Keon Ellis
  kenrich: [79, 210, 79.25, 8.5], // Kenrich Williams
  kessler: [86, 245, 88.25, 8.5], // Walker Kessler
  kgeorge: [76, 185, 79], // Keyonte George *
  klay: [77, 220, 81, 8.75], // Klay Thompson
  kmurray: [80, 225, 83], // Keegan Murray *
  knueppel: [78, 215, 78.25, 8.5], // Kon Knueppel
  kobe: [78, 212, 83], // Kobe Bryant *
  kolek: [74, 195, 74.75, 8.25], // Tyler Kolek
  kornet: [85, 270], // Luke Kornet
  ksanders: [80, 207, 80.25, 8.5], // Kobe Sanders
  kuminga: [79, 225], // Jonathan Kuminga
  kuzma: [80, 221, 84.25, 8.5], // Kyle Kuzma
  kyrie: [74, 195, 76, 8.25], // Kyrie Irving
  kyshawn: [80, 200, 82.25, 9], // Kyshawn George
  lamelo: [79, 180, 79], // LaMelo Ball *
  landale: [83, 255], // Jock Landale
  laravia: [79, 235, 81.5, 8.5], // Jake LaRavia
  larsson: [77, 215, 79.5, 8.75], // Pelle Larsson
  lavine: [77, 200, 80.25, 8.25], // Zach LaVine
  leaky: [78, 209], // Leaky Black
  lebron: [81, 250, 84.25], // LeBron James
  lendeborg: [81, 241, 87.25, 9], // Yaxel Lendeborg
  lillard: [74, 200, 79.75, 8.75], // Damian Lillard
  lmiller: [82, 220, 86, 9.5], // Leonard Miller
  luka: [80, 230, 82], // Luka Doncic *
  lyles: [81, 234, 85.5, 9.25], // Trey Lyles
  maluach: [86, 250, 90.75, 9.75], // Khaman Maluach
  mamu: [81, 240, 85.25, 9], // Sandro Mamukelashvili
  mara: [87, 262, 90, 9], // Aday Mara
  markkanen: [85, 240, 84], // Lauri Markkanen *
  matkovic: [82, 231], // Karlo Matkovic
  maxey: [74, 204, 78], // Tyrese Maxey *
  mbridges: [79, 225, 81.5, 9], // Miles Bridges
  mbrown: [77, 180], // Mikel Brown Jr.
  mcbride: [74, 195, 80.75, 9], // Miles McBride
  mccain: [75, 195, 75.5, 8.25], // Jared McCain
  mccollum: [75, 190, 78.25, 8], // CJ McCollum
  mcdaniels: [81, 185, 84], // Jaden McDaniels *
  meleek: [75, 190, 78.75, 8], // Meleek Thomas
  melton: [74, 200, 80.5, 8.5], // De'Anthony Melton
  merrill: [76, 205], // Sam Merrill
  missi: [83, 235, 86, 9.5], // Yves Missi
  mitchell: [74, 215, 82, 8.5], // Donovan Mitchell
  mobley: [83, 215, 88], // Evan Mobley *
  monk: [75, 200, 79], // Malik Monk *
  morant: [74, 174, 79], // Ja Morant *
  mpj: [82, 218, 84.25, 8.75], // Michael Porter Jr.
  mrobinson: [84, 240, 88], // Mitchell Robinson *
  mwagner: [83, 245, 84, 9], // Moritz Wagner
  naw: [77, 205, 81.5, 8.5], // Nickeil Alexander-Walker
  nembhard: [76, 191, 77.75, 8], // Andrew Nembhard
  nesmith: [77, 215], // Aaron Nesmith
  niang: [78, 230, 82, 9.25], // Georges Niang
  nmarshall: [78, 220, 84.75, 9.25], // Naji Marshall
  npowell: [76, 215, 82.75, 9.25], // Norman Powell
  nreid: [81, 264, 87.25, 9.5], // Naz Reid
  og: [79, 240, 86.25, 9.25], // OG Anunoby
  okogie: [76, 213, 84, 9], // Josh Okogie
  okongwu: [82, 240, 85], // Onyeka Okongwu *
  okoro: [76, 225], // Isaac Okoro
  oneale: [78, 226], // Royce O'Neale
  oubre: [80, 203, 86.25, 9], // Kelly Oubre Jr.
  peat: [80, 245, 83.25, 9], // Koa Peat
  peterson: [77, 199, 81.75, 8.5], // Darryn Peterson
  pgeorge: [80, 221, 83.25, 8.5], // Paul George
  pippen: [74, 170, 77.75, 7.75], // Scotty Pippen Jr.
  pjw: [79, 230, 86.25, 9], // P.J. Washington
  podz: [76, 205, 77.5, 8.25], // Brandin Podziemski
  poeltl: [84, 253, 86.75, 9.25], // Jakob Poeltl
  poole: [76, 194, 78.75, 8.25], // Jordan Poole
  portis: [81, 250, 86, 9.5], // Bobby Portis
  porzingis: [86, 240, 90], // Kristaps Porzingis *
  preed: [81, 210], // Paul Reed
  pritchard: [74, 211, 76], // Payton Pritchard *
  proctor: [76, 185, 79.25, 8.25], // Tyrese Proctor
  pwatson: [80, 200, 84.5, 8.5], // Peyton Watson
  pwilliams: [78, 215], // Patrick Williams
  qjackson: [76, 173], // Quenton Jackson
  queta: [84, 260, 88, 9.25], // Neemias Queta
  quickley: [74, 190, 80.25, 8], // Immanuel Quickley
  randle: [81, 250, 84, 8.75], // Julius Randle
  rdunn: [79, 216, 85.5, 9], // Ryan Dunn
  reaves: [77, 197, 78.25, 8], // Austin Reaves
  risacher: [80, 200, 81.5, 8.5], // Zaccharie Risacher
  robwilliams: [81, 249, 89.5], // Robert Williams III *
  rollins: [75, 180, 81.75, 8], // Ryan Rollins
  rsheppard: [74, 185, 75.25, 7.75], // Reed Sheppard
  rui: [80, 230, 86], // Rui Hachimura *
  sabonis: [82, 240, 82], // Domantas Sabonis *
  sarr: [84, 205, 88], // Alex Sarr *
  sbey: [80, 215], // Saddiq Bey
  scheierman: [78, 213, 80.25, 9.25], // Baylor Scheierman
  schroder: [73, 175, 79.75, 8.75], // Dennis Schroder
  scoot: [75, 207, 81], // Scoot Henderson *
  sengun: [83, 243, 84], // Alperen Sengun *
  sexton: [75, 190, 79.25, 8.25], // Collin Sexton
  sga: [78, 195, 83.5, 9], // Shai Gilgeous-Alexander
  shamet: [77, 190, 78.75, 8], // Landry Shamet
  shaq: [85, 325, 91], // Shaquille O'Neal *
  sharpe: [82, 265, 84], // Day'Ron Sharpe *
  shead: [73, 200, 75, 8.25], // Jamal Shead
  siakam: [80, 245, 87.25, 9.25], // Pascal Siakam
  simons: [76, 206, 81.25, 8.75], // Anfernee Simons
  sionjames: [77, 220, 78.5, 8.25], // Sion James
  smart: [75, 220, 81.25, 9], // Marcus Smart
  spencerj: [79, 225], // Spencer Jones
  stirtz: [76, 190, 78, 8.5], // Bennett Stirtz
  strus: [77, 215], // Max Strus
  suggs: [77, 205, 77], // Jalen Suggs *
  tatum: [80, 224, 83], // Jayson Tatum *
  thj: [77, 205, 79, 8], // Tim Hardaway Jr.
  thybulle: [77, 202], // Matisse Thybulle
  tmurphy: [80, 206, 84, 8.5], // Trey Murphy III
  toppin: [81, 220, 86], // Obi Toppin *
  trae: [74, 164, 75, 8], // Trae Young
  traore: [75, 185, 80, 7.75], // Nolan Traore
  trejohnson: [77, 190, 82.25, 8.5], // Tre Johnson
  trejones: [73, 185], // Tre Jones
  tshannon: [78, 215, 80.75, 8.75], // Terrence Shannon Jr.
  turner: [83, 250, 88, 9.25], // Myles Turner
  tyson: [78, 215, 80, 8.25], // Jaylon Tyson
  vanderbilt: [80, 214], // Jarred Vanderbilt
  vassell: [77, 205, 82], // Devin Vassell *
  wagler: [77, 188, 78.25, 8], // Keaton Wagler
  walsh: [79, 208, 85.75, 8.75], // Jordan Walsh
  ware: [84, 250, 88.5, 9.5], // Kel'el Ware
  wcj: [82, 270, 88.5, 8.5], // Wendell Carter Jr.
  wemby: [88, 240, 96], // Victor Wembanyama *
  white: [76, 200, 79.5, 8.25], // Derrick White
  wiggins: [79, 210, 84], // Andrew Wiggins *
  wolf: [83, 250, 86.25, 9.25], // Danny Wolf
  youngblood: [76, 221], // Chris Youngblood
  ziaire: [81, 185, 82.25, 9], // Ziaire Williams
  zion: [78, 284, 82.5], // Zion Williamson *
  zubac: [84, 240, 88], // Ivica Zubac *
};

// Visual build judgments from ESPN roster portraits and known playing physiques.
window.PH.buildTags = {
  ablack: 'lean', ace: 'lean', achiuwa: 'muscular', acuff: 'balanced',
  ad: 'muscular', ajay: 'balanced', ajgreen: 'balanced', amen: 'balanced',
  ament: 'lean', ausar: 'balanced', avdija: 'muscular', awiggins: 'lean',
  ayton: 'muscular', bagley: 'muscular', bam: 'muscular', bamba: 'lean',
  banchero: 'muscular', bane: 'muscular', barnes: 'muscular', barrett: 'muscular',
  battle: 'balanced', beal: 'balanced', beringer: 'lean', blopez: 'heavy',
  bmiller: 'lean', bogdan: 'balanced', bona: 'muscular', booker: 'balanced',
  boozer: 'muscular', braun: 'muscular', brazile: 'lean', bridges: 'lean',
  brunson: 'balanced', burries: 'balanced', butler: 'muscular', buzelis: 'lean',
  cade: 'muscular', camara: 'balanced', camjohnson: 'lean', camspencer: 'balanced',
  capela: 'muscular', carrington: 'lean', caruso: 'balanced', castle: 'muscular',
  cbryant: 'muscular', chet: 'lean', christie: 'lean', cissoko: 'balanced',
  clarkson: 'lean', claxton: 'lean', clayton: 'balanced', clingan: 'heavy',
  clowney: 'lean', cmartin: 'balanced', cmb: 'balanced', collier: 'muscular',
  conwell: 'balanced', coulibaly: 'lean', coward: 'balanced', curry: 'lean',
  cwhite: 'balanced', cwilson: 'lean', daniels: 'lean', dasilva: 'balanced',
  dbrooks: 'muscular', delarrea: 'lean', demin: 'lean', derozan: 'balanced',
  diabate: 'lean', djenkins: 'lean', djj: 'lean', djmurray: 'lean',
  dmitchell: 'muscular', dort: 'muscular', dosunmu: 'lean', dqueen: 'heavy',
  draymond: 'muscular', drobinson: 'lean', drummond: 'heavy', durant: 'lean',
  duren: 'muscular', dwade: 'balanced', dybantsa: 'lean', eason: 'muscular',
  edey: 'heavy', edgecombe: 'lean', edwards: 'muscular', ejiofor: 'muscular',
  embiid: 'muscular', esharp: 'lean', fears: 'lean', flagg: 'balanced',
  flemings: 'lean', fox: 'lean', franz: 'balanced', fvv: 'muscular',
  gafford: 'muscular', gallen: 'balanced', garland: 'lean', giannis: 'muscular',
  giddey: 'lean', gillespie: 'balanced', gobert: 'muscular', goodwin: 'balanced',
  gordon: 'muscular', graves: 'balanced', grimes: 'balanced', gsantos: 'balanced',
  haliburton: 'lean', harden: 'muscular', harper: 'balanced', hart: 'muscular',
  hartenstein: 'muscular', hauser: 'balanced', hayes: 'lean', hbarnes: 'balanced',
  herb: 'lean', herro: 'lean', hezonja: 'balanced', holiday: 'muscular',
  hopkins: 'muscular', horford: 'muscular', huerter: 'lean', huff: 'balanced',
  hugo: 'balanced', hunter: 'muscular', ighodaro: 'lean', ijackson: 'lean',
  istewart: 'heavy', jabariw: 'muscular', jakucionis: 'lean', jalensmith: 'balanced',
  jallen: 'lean', jaquez: 'balanced', jarace: 'muscular', jase: 'balanced',
  javonte: 'muscular', jbrown: 'muscular', jcain: 'lean', jcarter: 'muscular',
  jchamp: 'balanced', jclark: 'muscular', jcollins: 'muscular', jdub: 'muscular',
  jerome: 'balanced', jgrant: 'lean', jgreen: 'lean', jjj: 'muscular',
  jjohnson: 'muscular', jmurray: 'balanced', joe: 'lean', jokic: 'heavy',
  joshgreen: 'balanced', jovic: 'balanced', jsmall: 'balanced', jsmith: 'lean',
  julianc: 'balanced', jwalter: 'lean', jwells: 'lean', kalkbrenner: 'lean',
  karaban: 'balanced', kat: 'muscular', kawhi: 'muscular', kcp: 'lean',
  kdunn: 'lean', keldon: 'muscular', kellis: 'lean', kenrich: 'balanced',
  kessler: 'balanced', kgeorge: 'balanced', klay: 'balanced', kmurray: 'balanced',
  knueppel: 'balanced', kobe: 'muscular', kolek: 'balanced', kornet: 'balanced',
  ksanders: 'lean', kuminga: 'muscular', kuzma: 'balanced', kyrie: 'lean',
  kyshawn: 'balanced', lamelo: 'lean', landale: 'muscular', laravia: 'balanced',
  larsson: 'balanced', lavine: 'lean', leaky: 'lean', lebron: 'muscular',
  lendeborg: 'balanced', lillard: 'balanced', lmiller: 'lean', luka: 'balanced',
  lyles: 'balanced', maluach: 'lean', mamu: 'heavy', mara: 'lean',
  markkanen: 'lean', matkovic: 'balanced', maxey: 'balanced', mbridges: 'muscular',
  mbrown: 'lean', mcbride: 'muscular', mccain: 'balanced', mccollum: 'lean',
  mcdaniels: 'lean', meleek: 'lean', melton: 'lean', merrill: 'balanced',
  missi: 'lean', mitchell: 'muscular', mobley: 'lean', monk: 'lean',
  morant: 'lean', mpj: 'lean', mrobinson: 'muscular', mwagner: 'muscular',
  naw: 'lean', nembhard: 'balanced', nesmith: 'muscular', niang: 'heavy',
  nmarshall: 'balanced', npowell: 'muscular', nreid: 'heavy', og: 'muscular',
  okogie: 'muscular', okongwu: 'muscular', okoro: 'muscular', oneale: 'muscular',
  oubre: 'lean', peat: 'muscular', peterson: 'lean', pgeorge: 'lean',
  pippen: 'lean', pjw: 'muscular', podz: 'balanced', poeltl: 'muscular',
  poole: 'lean', portis: 'muscular', porzingis: 'lean', preed: 'lean',
  pritchard: 'balanced', proctor: 'lean', pwatson: 'lean', pwilliams: 'muscular',
  qjackson: 'lean', queta: 'muscular', quickley: 'lean', randle: 'muscular',
  rdunn: 'muscular', reaves: 'lean', risacher: 'lean', robwilliams: 'muscular',
  rollins: 'lean', rsheppard: 'balanced', rui: 'muscular', sabonis: 'muscular',
  sarr: 'lean', sbey: 'muscular', scheierman: 'balanced', schroder: 'lean',
  scoot: 'muscular', sengun: 'muscular', sexton: 'balanced', sga: 'lean',
  shamet: 'lean', shaq: 'heavy', sharpe: 'muscular', shead: 'muscular',
  siakam: 'muscular', simons: 'lean', sionjames: 'muscular', smart: 'muscular',
  spencerj: 'lean', stirtz: 'lean', strus: 'balanced', suggs: 'muscular',
  tatum: 'balanced', thj: 'lean', thybulle: 'lean', tmurphy: 'lean',
  toppin: 'balanced', trae: 'lean', traore: 'lean', trejohnson: 'lean',
  trejones: 'lean', tshannon: 'muscular', turner: 'muscular', tyson: 'muscular',
  vanderbilt: 'lean', vassell: 'lean', wagler: 'lean', walsh: 'lean',
  ware: 'muscular', wcj: 'muscular', wemby: 'lean', white: 'balanced',
  wiggins: 'balanced', wolf: 'heavy', youngblood: 'muscular', ziaire: 'lean',
  zion: 'heavy', zubac: 'muscular',
};
