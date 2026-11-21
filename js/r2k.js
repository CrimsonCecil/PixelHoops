// PIXEL HOOPS - 2K 细分能力（持球速度 / 敏捷 / 进攻稳定性 / 防守稳定性 / 拼抢 / 耐久 + 推算横移速度用的外防、弹跳原值）。
// 数值取自 NBA 2KLab 的 2K27 球员能力表（https://www.nba2klab.com/nba2k-player-ratings，2026-11-20 读取，502 人），按 r5.js 的 8 项 2K 原值逐人对上。
// 字段顺序：spdB 持球速度 Speed With Ball、agi 敏捷 Agility、ocon 进攻稳定性、dcon 防守稳定性、hus 拼抢 Hustle、dur 耐久 Durability、perD 外线防守、vert 弹跳。
// 没对上的球员（传奇、少数名单外）由 game.js 按现有能力推算。
window.PH = window.PH || {};
window.PH.R2K = {
  // [罚球, 造犯规]：现役取 2025–26 NBA 常规赛总计，传奇和未出赛的老将取 NBA 生涯（Basketball Reference）。
  // 罚球用实际 FT%，按 30 次 2K 罚球（无 2K 时 78%）平滑。造犯规按 100 次出手平滑 FTA/FGA，
  // 用 38 + 130 × FTA/FGA 映射到 0–99，与 2K Draw Foul 按 40:60 混合（无 2K 时只用映射值）。
  // 无 NBA 样本则用 2K 原值。
  FT: {
    ablack: [73, 75], ace: [76, 56], achiuwa: [56, 56], acuff: [81, 54], ad: [73, 82],
    ajay: [87, 77], ajgreen: [85, 44], amen: [78, 60], ament: [79, 62], ausar: [57, 56],
    avdija: [80, 88], awiggins: [74, 60], ayton: [64, 62], bagley: [66, 61], bam: [78, 70],
    bamba: [68, 45], banchero: [77, 97], bane: [91, 55], barkley: [73, 99], barnes: [81, 81],
    barrett: [72, 81], battle: [77, 49], beal: [77, 63], beringer: [67, 49], blopez: [76, 45],
    bmiller: [89, 77], bogdan: [80, 52], bona: [71, 56], booker: [87, 90], boozer: [79, 68],
    braun: [78, 70], bridges: [83, 57], brunson: [84, 89], burries: [80, 44], butler: [86, 92],
    buzelis: [79, 76], bwallace: [41, 99], cade: [81, 89], camara: [71, 42], camjohnson: [84, 66],
    camspencer: [94, 58], capela: [58, 48], carrington: [72, 57], carter: [80, 75], caruso: [80, 46],
    castle: [73, 89], cbryant: [71, 44], chet: [79, 85], christie: [90, 49], cissoko: [66, 69],
    clarkson: [83, 60], claxton: [62, 55], clayton: [90, 85], clingan: [68, 72], clowney: [80, 72],
    cmartin: [61, 56], cmb: [66, 71], collier: [72, 64], conwell: [83, 42], coulibaly: [75, 60],
    coward: [84, 54], curry: [92, 77], cwhite: [82, 82], cwilson: [71, 66], daniels: [62, 54],
    dasilva: [89, 56], dbrooks: [84, 68], delarrea: [83, 49], demin: [83, 57], derozan: [86, 91],
    diabate: [66, 71], djenkins: [83, 73], djj: [76, 58], djmurray: [87, 63], dmitchell: [65, 39],
    dort: [76, 44], dosunmu: [87, 64], dqueen: [79, 79], draymond: [70, 41], drobinson: [76, 56],
    drummond: [63, 49], durant: [87, 84], duren: [74, 68], dwade: [71, 47], dybantsa: [77, 69],
    eason: [77, 47], edey: [78, 56], edgecombe: [82, 69], edwards: [80, 91], ejiofor: [72, 52],
    embiid: [85, 98], esharp: [89, 40], fears: [79, 76], flagg: [83, 81], flemings: [78, 44],
    fox: [76, 57], franz: [82, 93], fvv: [81, 55], gafford: [68, 71], gallen: [86, 57],
    garland: [86, 54], giannis: [65, 98], giddey: [76, 86], gillespie: [87, 61], ginobili: [83, 90],
    gobert: [53, 82], goodwin: [70, 61], gordon: [77, 87], graves: [75, 44], grimes: [84, 74],
    gsantos: [73, 54], haliburton: [86, 62], harden: [88, 96], harper: [75, 73], hart: [72, 60],
    hartenstein: [61, 76], hauser: [87, 51], hayes: [65, 69], hbarnes: [83, 49], herb: [81, 55],
    herro: [92, 76], hezonja: [80, 35], holiday: [84, 46], hopkins: [71, 45], horford: [85, 37],
    huerter: [77, 51], huff: [83, 62], hugo: [50, 43], hunter: [87, 65], ighodaro: [45, 50],
    ijackson: [65, 69], istewart: [76, 60], iverson: [78, 91], jabariw: [74, 51], jakucionis: [88, 73],
    jalensmith: [74, 61], jallen: [71, 87], jaquez: [77, 54], jarace: [75, 51], jase: [72, 58],
    javonte: [84, 66], jbrown: [80, 87], jcain: [87, 49], jcarter: [81, 42], jchamp: [78, 50],
    jclark: [66, 49], jcollins: [77, 50], jdub: [84, 61], jerome: [88, 76], jgrant: [81, 82],
    jgreen: [75, 67], jjj: [80, 72], jjohnson: [79, 86], jmurray: [89, 75], joe: [89, 79],
    jokic: [83, 96], joshgreen: [89, 48], jovic: [68, 67], jsmall: [83, 64], jsmith: [78, 58],
    julianc: [84, 67], jwalter: [80, 52], jwells: [78, 60], kalkbrenner: [71, 74], karaban: [85, 45],
    kat: [86, 84], kawhi: [89, 83], kcp: [91, 48], kdunn: [77, 47], keldon: [79, 64],
    kellis: [73, 56], kenrich: [64, 57], kessler: [70, 57], kgeorge: [89, 89], klay: [76, 55],
    kmurray: [78, 49], knueppel: [86, 52], kobe: [84, 88], kolek: [70, 46], kornet: [82, 68],
    ksanders: [82, 63], kuminga: [73, 81], kuzma: [73, 58], kyrie: [92, 75], kyshawn: [80, 43],
    lamelo: [90, 65], landale: [64, 52], laravia: [76, 71], larsson: [80, 77], lavine: [88, 77],
    leaky: [80, 56], lebron: [74, 81], lendeborg: [82, 42], lillard: [93, 62], lmiller: [74, 66],
    luka: [78, 97], lyles: [68, 51], maluach: [71, 47], mamu: [75, 60], mara: [56, 52],
    markkanen: [90, 84], matkovic: [73, 49], maxey: [89, 83], mbridges: [82, 82], mbrown: [84, 60],
    mcbride: [80, 54], mccain: [87, 58], mccollum: [77, 57], mcdaniels: [84, 67], meleek: [84, 39],
    melton: [83, 55], merrill: [86, 56], missi: [56, 53], mitchell: [86, 85], mobley: [61, 75],
    monk: [88, 50], morant: [90, 89], mpj: [86, 60], mrobinson: [41, 58], mutombo: [68, 99],
    mwagner: [82, 52], nash: [90, 72], naw: [90, 69], nembhard: [83, 54], nesmith: [83, 74],
    niang: [85, 50], nmarshall: [76, 86], npowell: [83, 72], nreid: [73, 59], og: [83, 71], okogie: [59, 55],
    okongwu: [76, 73], okoro: [79, 59], oneale: [71, 54], oubre: [76, 71], peat: [62, 44],
    peterson: [83, 72], pgeorge: [82, 49], pippen: [78, 54], pjw: [69, 54], podz: [79, 75],
    poeltl: [61, 66], poole: [86, 76], portis: [71, 74], porzingis: [84, 61], preed: [66, 69],
    pritchard: [89, 56], proctor: [89, 45], pwatson: [73, 54], pwilliams: [71, 49], qjackson: [82, 66],
    queta: [70, 61], quickley: [82, 63], rallen: [89, 72], randle: [80, 85], rdunn: [49, 38],
    reaves: [87, 93], rip: [85, 75], risacher: [64, 56], robwilliams: [62, 37], rodman: [58, 83],
    rollins: [80, 71], rsheppard: [80, 51], rui: [70, 51], sabonis: [73, 74], sarr: [69, 78],
    sbey: [84, 84], scheierman: [88, 46], schroder: [83, 52], scoot: [84, 51], sengun: [69, 77],
    sexton: [86, 62], sga: [88, 98], shamet: [71, 68], shaq: [53, 99], sharpe: [68, 59],
    shead: [78, 49], siakam: [69, 79], simons: [90, 57], sionjames: [84, 55], smart: [82, 43],
    spencerj: [61, 60], stirtz: [85, 44], strus: [86, 43], suggs: [85, 54], tatum: [82, 84],
    thj: [81, 70], thybulle: [86, 36], tmac: [75, 82], tmurphy: [89, 77], toppin: [89, 62],
    trae: [83, 96], traore: [78, 63], trejohnson: [87, 55], trejones: [84, 86], tshannon: [79, 71],
    turner: [74, 52], tyson: [73, 60], vanderbilt: [60, 48], vassell: [82, 50], wagler: [80, 59],
    walsh: [77, 50], ware: [74, 60], wcj: [79, 80], wemby: [83, 95], white: [90, 65],
    wiggins: [78, 55], wolf: [77, 69], yao: [83, 98], youngblood: [83, 64], ziaire: [85, 60],
    zion: [72, 91], zubac: [71, 62],
  },
  F: ['spdB', 'agi', 'ocon', 'dcon', 'hus', 'dur', 'perD', 'vert'],
  // 2KRatings 的 2K27 传奇版本（2KLab 未收录）：[拼抢, 防守稳定性]。后者只用于徽章分档。
  HUS: { yao: [90, 95], mutombo: [91, 98], tmac: [80, 85], nash: [98, 90], rip: [98, 85], kobe: [85, 97], shaq: [98, 98], ginobili: [98, 98], iverson: [97, 91], carter: [95, 80], rodman: [99, 98], bwallace: [98, 99], rallen: [98, 80] },
  P: {
    ablack: [74, 85, 85, 80, 90, 87, 84, 75],  // Anthony Black
    ace: [79, 84, 90, 60, 80, 89, 68, 79],  // Ace Bailey
    achiuwa: [66, 74, 65, 75, 90, 83, 56, 79],  // Precious Achiuwa
    acuff: [90, 92, 60, 50, 75, 80, 61, 84],  // Darius Acuff Jr
    ad: [67, 78, 85, 90, 85, 65, 80, 86],  // Anthony Davis
    ajay: [79, 80, 90, 75, 75, 76, 77, 65],  // Ajay Mitchell
    ajgreen: [68, 69, 75, 45, 70, 82, 63, 75],  // AJ Green
    amen: [93, 93, 60, 95, 85, 95, 93, 99],  // Amen Thompson
    ament: [71, 73, 40, 45, 50, 80, 60, 79],  // Nate Ament
    ausar: [86, 96, 25, 95, 95, 86, 97, 98],  // Ausar Thompson
    avdija: [69, 81, 90, 80, 95, 89, 80, 79],  // Deni Avdija
    awiggins: [75, 84, 80, 55, 65, 81, 59, 72],  // Aaron Wiggins
    ayton: [55, 65, 40, 70, 50, 81, 49, 82],  // Deandre Ayton
    bagley: [64, 74, 75, 40, 80, 73, 49, 86],  // Marvin Bagley III
    bam: [66, 84, 95, 95, 90, 86, 88, 83],  // Bam Adebayo
    bamba: [32, 51, 35, 60, 75, 77, 48, 75],  // Mohamed Bamba
    banchero: [74, 80, 95, 45, 85, 90, 66, 83],  // Paolo Banchero
    bane: [70, 80, 95, 70, 85, 87, 79, 78],  // Desmond Bane
    barnes: [77, 82, 90, 95, 95, 94, 91, 92],  // Scottie Barnes
    barrett: [82, 84, 80, 75, 80, 84, 81, 82],  // RJ Barrett
    battle: [57, 58, 75, 40, 70, 83, 58, 65],  // Jamison Battle
    beringer: [41, 67, 40, 40, 90, 85, 40, 80],  // Joan Beringer
    blopez: [25, 60, 70, 80, 85, 78, 45, 60],  // Brook Lopez
    bmiller: [78, 82, 95, 65, 80, 84, 73, 85],  // Brandon Miller
    bogdan: [73, 75, 45, 40, 67, 71, 63, 78],  // Bogdan Bogdanović
    bona: [57, 68, 40, 60, 90, 86, 37, 89],  // Adem Bona
    booker: [83, 80, 95, 65, 95, 83, 75, 79],  // Devin Booker
    boozer: [64, 63, 65, 55, 90, 80, 59, 71],  // Cameron Boozer
    braun: [74, 83, 75, 80, 95, 83, 79, 83],  // Christian Braun
    bridges: [72, 87, 75, 85, 95, 91, 88, 85],  // Mikal Bridges
    brunson: [84, 84, 98, 75, 95, 87, 73, 75],  // Jalen Brunson
    burries: [75, 78, 50, 50, 80, 80, 69, 80],  // Brayden Burries
    butler: [79, 92, 80, 85, 98, 67, 86, 82],  // Jimmy Butler
    buzelis: [76, 70, 90, 50, 85, 92, 62, 84],  // Matas Buzelis
    cade: [83, 84, 98, 80, 95, 85, 83, 80],  // Cade Cunningham
    camara: [58, 89, 40, 95, 95, 96, 91, 78],  // Toumani Camara
    camjohnson: [43, 70, 75, 65, 86, 75, 69, 79],  // Cameron Johnson
    camspencer: [70, 73, 70, 45, 90, 84, 59, 53],  // Cam Spencer
    capela: [30, 51, 30, 80, 75, 78, 47, 68],  // Clint Capela
    carrington: [77, 72, 70, 35, 80, 96, 55, 75],  // Carlton Carrington
    caruso: [82, 94, 50, 85, 85, 69, 90, 72],  // Alex Caruso
    castle: [80, 93, 95, 90, 90, 89, 90, 72],  // Stephon Castle
    cbryant: [75, 88, 55, 85, 85, 87, 84, 80],  // Carter Bryant
    chet: [67, 75, 80, 90, 90, 87, 75, 75],  // Chet Holmgren
    christie: [78, 87, 75, 75, 85, 91, 80, 82],  // Max Christie
    cissoko: [66, 75, 75, 50, 80, 86, 66, 80],  // Sidy Cissoko
    clarkson: [79, 75, 70, 40, 80, 79, 58, 85],  // Jordan Clarkson
    claxton: [44, 77, 70, 85, 89, 82, 79, 79],  // Nicolas Claxton
    clayton: [84, 84, 55, 45, 75, 88, 64, 74],  // Walter Clayton Jr
    clingan: [38, 45, 70, 80, 75, 88, 49, 60],  // Donovan Clingan
    clowney: [57, 64, 80, 55, 85, 83, 57, 75],  // Noah Clowney
    cmartin: [59, 74, 45, 70, 90, 73, 75, 74],  // Caleb Martin
    cmb: [74, 86, 70, 65, 95, 78, 74, 75],  // Collin Murray-Boyles
    collier: [90, 88, 75, 55, 80, 83, 62, 75],  // Isaiah Collier
    conwell: [73, 76, 50, 40, 80, 85, 64, 82],  // Ryan Conwell
    coulibaly: [64, 85, 50, 75, 80, 81, 80, 85],  // Bilal Coulibaly
    coward: [79, 84, 65, 55, 85, 84, 73, 83],  // Cedric Coward
    curry: [83, 84, 98, 65, 85, 70, 69, 73],  // Stephen Curry
    cwhite: [84, 85, 80, 55, 85, 84, 64, 81],  // Coby White
    cwilson: [76, 82, 50, 65, 85, 67, 75, 92],  // Caleb Wilson
    daniels: [79, 93, 50, 90, 85, 92, 94, 75],  // Dyson Daniels
    dasilva: [59, 67, 70, 50, 85, 92, 64, 67],  // Tristan da Silva
    dbrooks: [69, 88, 80, 85, 95, 78, 88, 75],  // Dillon Brooks
    delarrea: [70, 70, 45, 45, 85, 80, 60, 70],  // Sergio De Larrea
    demin: [70, 75, 75, 60, 90, 78, 65, 74],  // Egor Dëmin
    diabate: [66, 73, 60, 55, 95, 85, 41, 78],  // Moussa Diabaté
    djenkins: [74, 75, 60, 65, 80, 86, 69, 70],  // Daniss Jenkins
    djj: [61, 82, 65, 80, 80, 71, 82, 93],  // Derrick Jones Jr
    djmurray: [83, 85, 85, 80, 90, 60, 83, 60],  // Dejounte Murray
    dmitchell: [82, 88, 65, 85, 95, 84, 86, 70],  // Davion Mitchell
    dort: [76, 94, 40, 90, 94, 84, 90, 87],  // Luguentz Dort
    dosunmu: [73, 78, 80, 65, 75, 89, 69, 75],  // Ayo Dosunmu
    dqueen: [52, 54, 75, 60, 80, 94, 52, 62],  // Derik Queen
    draymond: [69, 84, 25, 95, 90, 78, 88, 66],  // Draymond Green
    drobinson: [56, 67, 85, 60, 75, 81, 67, 72],  // Duncan Robinson
    drummond: [49, 58, 50, 65, 75, 77, 52, 79],  // Andre Drummond
    durant: [77, 78, 95, 75, 90, 82, 77, 77],  // Kevin Durant
    duren: [59, 68, 60, 85, 80, 89, 62, 84],  // Jalen Duren
    dwade: [43, 84, 40, 85, 85, 73, 84, 83],  // Dean Wade
    dybantsa: [80, 83, 65, 55, 80, 83, 70, 92],  // AJ Dybantsa
    eason: [72, 85, 40, 80, 85, 79, 85, 80],  // Tari Eason
    edey: [30, 31, 70, 75, 85, 57, 37, 66],  // Zach Edey
    edgecombe: [85, 91, 85, 75, 85, 93, 77, 88],  // VJ Edgecombe
    edwards: [90, 90, 98, 85, 90, 91, 85, 97],  // Anthony Edwards
    ejiofor: [67, 60, 30, 65, 90, 84, 67, 82],  // Zuby Ejiofor
    embiid: [57, 59, 95, 80, 65, 63, 68, 60],  // Joel Embiid
    esharp: [72, 80, 50, 45, 81, 81, 62, 68],  // Emanuel Sharp
    fears: [90, 88, 75, 60, 85, 94, 62, 75],  // Jeremiah Fears
    flagg: [75, 85, 95, 80, 90, 91, 83, 77],  // Cooper Flagg
    flemings: [90, 90, 50, 65, 90, 80, 74, 85],  // Kingston Flemings
    fox: [97, 93, 90, 80, 90, 83, 84, 84],  // De'Aaron Fox
    franz: [68, 73, 90, 70, 85, 78, 73, 75],  // Franz Wagner
    fvv: [83, 80, 60, 80, 94, 56, 80, 75],  // Fred VanVleet
    gafford: [44, 70, 50, 80, 89, 76, 57, 80],  // Daniel Gafford
    gallen: [79, 78, 85, 45, 80, 73, 72, 81],  // Grayson Allen
    garland: [88, 88, 90, 50, 90, 81, 71, 84],  // Darius Garland
    giannis: [80, 86, 98, 95, 95, 70, 87, 85],  // Giannis Antetokounmpo
    giddey: [79, 79, 85, 45, 90, 85, 62, 74],  // Josh Giddey
    gillespie: [82, 82, 90, 55, 80, 83, 62, 72],  // Collin Gillespie
    gobert: [25, 65, 40, 95, 95, 83, 64, 57],  // Rudy Gobert
    goodwin: [73, 84, 75, 75, 95, 81, 76, 55],  // Jordan Goodwin
    gordon: [66, 84, 70, 80, 95, 68, 84, 92],  // Aaron Gordon
    graves: [68, 68, 50, 45, 90, 80, 57, 68],  // Allen Graves
    grimes: [79, 84, 75, 75, 80, 89, 83, 75],  // Quentin Grimes
    gsantos: [69, 72, 80, 50, 75, 86, 69, 74],  // Gui Santos
    haliburton: [83, 84, 80, 75, 95, 64, 77, 70],  // Tyrese Haliburton
    harden: [82, 85, 95, 65, 60, 82, 70, 87],  // James Harden
    harper: [86, 89, 90, 65, 85, 85, 70, 83],  // Dylan Harper
    hart: [79, 86, 75, 80, 99, 83, 86, 69],  // Josh Hart
    hartenstein: [42, 62, 75, 80, 95, 72, 41, 70],  // Isaiah Hartenstein
    hauser: [55, 62, 75, 45, 88, 82, 55, 62],  // Sam Hauser
    hayes: [41, 64, 65, 65, 95, 84, 48, 75],  // Jaxson Hayes
    hbarnes: [73, 75, 80, 60, 75, 85, 72, 95],  // Harrison Barnes
    herb: [69, 91, 30, 85, 85, 75, 90, 72],  // Herbert Jones
    herro: [74, 78, 95, 50, 70, 78, 69, 72],  // Tyler Herro
    hezonja: [73, 75, 50, 35, 72, 89, 68, 79],  // Mario Hezonja
    holiday: [78, 90, 65, 85, 92, 74, 89, 68],  // Jrue Holiday
    hopkins: [66, 70, 40, 45, 85, 83, 68, 75],  // Bryce Hopkins
    horford: [33, 67, 50, 85, 85, 66, 68, 69],  // AI Horford
    huerter: [72, 73, 75, 50, 80, 83, 64, 75],  // Kevin Huerter
    huff: [33, 47, 75, 75, 85, 81, 32, 62],  // Jay Huff
    hugo: [70, 75, 65, 65, 90, 88, 73, 75],  // Hugo González
    hunter: [69, 83, 70, 80, 80, 71, 82, 75],  // De'Andre Hunter
    ighodaro: [65, 74, 70, 45, 85, 91, 47, 90],  // Oso Ighodaro
    ijackson: [54, 73, 45, 55, 90, 73, 54, 81],  // Isaiah Jackson
    istewart: [52, 71, 60, 80, 85, 83, 78, 70],  // Isaiah Stewart
    jabariw: [71, 75, 40, 60, 70, 85, 60, 79],  // Jabari Walker
    jakucionis: [82, 82, 75, 60, 85, 84, 66, 75],  // Kasparas Jakucionis
    jalensmith: [49, 68, 80, 45, 70, 77, 48, 86],  // Jalen Smith
    jallen: [35, 72, 90, 85, 90, 80, 72, 79],  // Jarrett Allen
    jaquez: [64, 75, 80, 75, 90, 91, 72, 82],  // Jaime Jaquez Jr
    jarace: [70, 81, 80, 60, 80, 88, 62, 90],  // Jarace Walker
    jase: [80, 84, 50, 55, 85, 84, 67, 80],  // Jase Richardson
    javonte: [69, 74, 50, 75, 85, 77, 77, 85],  // Javonte Green
    jbrown: [76, 88, 95, 85, 95, 83, 90, 84],  // Jaylen Brown
    jcain: [60, 68, 65, 50, 70, 78, 68, 75],  // Jamal Cain
    jcarter: [76, 83, 65, 70, 76, 80, 79, 71],  // Jevon Carter
    jchamp: [66, 73, 75, 70, 85, 86, 73, 78],  // Justin Champagnie
    jclark: [76, 86, 50, 75, 85, 87, 81, 77],  // Jaylen Clark
    jcollins: [50, 65, 40, 50, 85, 80, 49, 85],  // John Collins
    jdub: [83, 92, 70, 90, 90, 78, 88, 83],  // Jalen Williams
    jerome: [68, 73, 95, 35, 68, 54, 56, 62],  // Ty Jerome
    jgrant: [72, 77, 80, 75, 94, 74, 69, 78],  // Jerami Grant
    jgreen: [84, 88, 75, 55, 85, 79, 64, 92],  // Jalen Green
    jjj: [33, 80, 75, 95, 80, 76, 80, 75],  // Jaren Jackson Jr
    jjohnson: [74, 76, 95, 50, 80, 86, 66, 82],  // Jalen Johnson
    jmurray: [79, 80, 90, 70, 85, 85, 77, 80],  // Jamal Murray
    joe: [63, 77, 85, 55, 75, 80, 69, 79],  // Isaiah Joe
    jokic: [60, 62, 98, 80, 80, 81, 61, 63],  // Nikola Jokić
    joshgreen: [72, 86, 30, 75, 90, 82, 79, 80],  // Josh Green
    jovic: [67, 68, 60, 40, 70, 79, 62, 72],  // Nikola Jovic
    jsmall: [84, 85, 80, 40, 90, 73, 64, 89],  // Javon Small
    jsmith: [69, 76, 85, 55, 85, 93, 69, 75],  // Jabari Smith Jr
    julianc: [65, 75, 80, 70, 75, 93, 75, 67],  // Julian Champagnie
    jwalter: [79, 82, 75, 50, 85, 84, 66, 76],  // Ja'Kobe Walter
    jwells: [70, 80, 60, 75, 85, 89, 80, 67],  // Jaylen Wells
    kalkbrenner: [30, 35, 70, 75, 85, 87, 30, 74],  // Ryan Kalkbrenner
    karaban: [62, 66, 50, 45, 85, 80, 62, 69],  // Alex Karaban
    kat: [66, 76, 85, 65, 90, 84, 50, 70],  // Karl-Anthony Towns
    kawhi: [79, 89, 95, 90, 85, 72, 89, 79],  // Kawhi Leonard
    kcp: [75, 84, 30, 80, 85, 76, 84, 69],  // Kentavious Caldwell-Pope
    kdunn: [82, 87, 45, 85, 90, 80, 87, 83],  // Kris Dunn
    keldon: [73, 78, 70, 65, 95, 87, 73, 71],  // Keldon Johnson
    kellis: [77, 84, 40, 85, 80, 88, 84, 79],  // Keon Ellis
    kenrich: [63, 75, 60, 75, 90, 74, 75, 72],  // Kenrich Williams
    kessler: [35, 52, 65, 85, 90, 64, 65, 60],  // Walker Kessler
    kgeorge: [78, 78, 95, 50, 85, 84, 65, 72],  // Keyonte George
    klay: [67, 75, 80, 70, 80, 79, 75, 67],  // Klay Thompson
    kmurray: [73, 79, 75, 75, 86, 76, 78, 79],  // Keegan Murray
    knueppel: [64, 70, 95, 65, 95, 96, 70, 78],  // Kon Knueppel
    kolek: [74, 84, 65, 50, 90, 85, 73, 74],  // Tyler Kolek
    kornet: [33, 37, 75, 70, 85, 75, 32, 62],  // Luke Kornet
    ksanders: [74, 75, 70, 45, 90, 86, 57, 75],  // Kobe Sanders
    kuzma: [67, 74, 70, 70, 95, 81, 75, 75],  // Kyle Kuzma
    kyrie: [83, 85, 95, 55, 87, 53, 67, 81],  // Kyrie Irving
    kyshawn: [60, 74, 90, 60, 85, 80, 70, 72],  // Kyshawn George
    lamelo: [84, 84, 90, 75, 89, 82, 70, 79],  // LaMelo Ball
    landale: [45, 54, 65, 45, 70, 76, 48, 75],  // Jock Landale
    laravia: [57, 78, 50, 75, 85, 85, 78, 72],  // Jake LaRavia
    larsson: [74, 80, 75, 50, 85, 84, 65, 79],  // Pelle Larsson
    lavine: [81, 82, 85, 40, 65, 71, 61, 97],  // Zach LaVine
    lebron: [85, 84, 80, 60, 70, 74, 74, 89],  // LeBron James
    lendeborg: [70, 70, 50, 50, 80, 80, 70, 81],  // Yaxel Lendeborg
    lillard: [83, 87, 90, 60, 95, 54, 69, 89],  // Damian Lillard
    lmiller: [70, 73, 75, 40, 85, 85, 63, 82],  // Leonard Miller
    luka: [83, 77, 98, 45, 98, 84, 59, 79],  // Luka Dončić
    lyles: [54, 59, 60, 40, 80, 76, 36, 65],  // Trey Lyles
    maluach: [37, 63, 40, 75, 85, 85, 63, 65],  // Khaman Maluach
    mamu: [49, 59, 80, 45, 85, 81, 50, 69],  // Sandro Mamukelashvili
    mara: [37, 46, 55, 60, 85, 80, 44, 53],  // Aday Mara
    markkanen: [42, 65, 90, 65, 85, 73, 65, 62],  // Lauri Markkanen
    matkovic: [47, 51, 70, 50, 80, 80, 41, 67],  // Karlo Matković
    maxey: [96, 90, 98, 65, 98, 90, 79, 80],  // Tyrese Maxey
    mbridges: [71, 76, 95, 45, 80, 88, 59, 85],  // Miles Bridges
    mbrown: [81, 82, 50, 50, 80, 80, 63, 80],  // Mikel Brown Jr
    mcbride: [80, 86, 70, 75, 85, 76, 81, 80],  // Miles McBride
    mccain: [75, 76, 80, 55, 80, 78, 63, 68],  // Jared McCain
    mccollum: [82, 84, 95, 65, 95, 82, 70, 80],  // CJ McCollum
    mcdaniels: [70, 91, 75, 90, 85, 91, 91, 80],  // Jaden McDaniels
    meleek: [77, 77, 50, 45, 85, 80, 64, 77],  // Meleek Thomas
    melton: [74, 81, 80, 80, 85, 69, 82, 75],  // De'Anthony Melton
    merrill: [60, 68, 80, 55, 60, 70, 68, 60],  // Sam Merrill
    missi: [45, 67, 45, 60, 95, 87, 48, 85],  // Yves Missi
    mitchell: [91, 90, 95, 75, 95, 85, 75, 97],  // Donovan Mitchell
    mobley: [66, 79, 75, 90, 90, 88, 82, 81],  // Evan Mobley
    monk: [76, 80, 80, 45, 72, 81, 60, 88],  // Malik Monk
    morant: [95, 95, 85, 75, 75, 62, 72, 97],  // Ja Morant
    mpj: [77, 81, 90, 40, 80, 78, 64, 88],  // Michael Porter Jr
    mrobinson: [25, 65, 35, 80, 85, 72, 49, 76],  // Mitchell Robinson
    mwagner: [53, 67, 80, 35, 85, 66, 40, 75],  // Moritz Wagner
    naw: [72, 87, 85, 80, 75, 88, 84, 70],  // Nickeil Alexander-Walker
    nembhard: [74, 88, 60, 85, 69, 87, 86, 71],  // Andrew Nembhard
    nesmith: [64, 76, 70, 75, 85, 72, 76, 79],  // Aaron Nesmith
    nmarshall: [62, 65, 85, 40, 70, 83, 60, 75],  // Naji Marshall
    npowell: [77, 80, 95, 75, 90, 76, 79, 80],  // Norman Powell
    nreid: [49, 54, 80, 75, 95, 85, 54, 75],  // Naz Reid
    og: [71, 91, 90, 95, 85, 81, 94, 85],  // OG Anunoby
    okogie: [81, 84, 70, 70, 95, 80, 77, 92],  // Josh Okogie
    okongwu: [60, 74, 80, 65, 95, 89, 64, 75],  // Onyeka Okongwu
    okoro: [73, 85, 45, 80, 90, 85, 84, 80],  // Isaac Okoro
    oneale: [62, 83, 70, 75, 80, 85, 80, 65],  // Royce O'Neale
    oubre: [69, 82, 80, 55, 75, 74, 74, 95],  // Kelly Oubre Jr
    peat: [69, 74, 50, 50, 90, 80, 62, 88],  // Koa Peat
    peterson: [81, 84, 65, 60, 90, 80, 73, 84],  // Darryn Peterson
    pgeorge: [77, 84, 85, 70, 75, 73, 79, 75],  // Paul George
    pippen: [82, 82, 75, 50, 75, 61, 62, 79],  // Scotty Pippen Jr
    pjw: [63, 80, 50, 80, 85, 80, 79, 69],  // PJ Washington
    podz: [81, 82, 90, 45, 85, 93, 63, 78],  // Brandin Podziemski
    poeltl: [31, 37, 60, 80, 80, 72, 45, 57],  // Jakob Poeltl
    poole: [80, 79, 70, 30, 65, 82, 57, 73],  // Jordan Poole
    portis: [59, 64, 55, 65, 90, 81, 40, 64],  // Bobby Portis Jr
    porzingis: [56, 65, 80, 55, 70, 68, 56, 78],  // Kristaps Porzingis
    preed: [41, 52, 70, 40, 80, 82, 43, 65],  // Paul Reed
    pritchard: [75, 75, 90, 35, 78, 87, 60, 66],  // Payton Pritchard
    proctor: [82, 81, 70, 45, 85, 80, 60, 77],  // Tyrese Proctor
    pwatson: [76, 80, 80, 80, 75, 78, 78, 82],  // Peyton Watson
    pwilliams: [64, 74, 55, 65, 75, 86, 76, 77],  // Patrick Williams
    qjackson: [76, 85, 75, 65, 75, 71, 73, 88],  // Quenton Jackson
    queta: [30, 59, 60, 85, 95, 81, 68, 65],  // Neemias Queta
    quickley: [76, 82, 95, 75, 85, 83, 80, 79],  // Immanuel Quickley
    randle: [68, 76, 80, 75, 90, 84, 73, 69],  // Julius Randle
    rdunn: [69, 88, 50, 80, 90, 87, 80, 79],  // Ryan Dunn
    reaves: [78, 80, 90, 55, 80, 78, 66, 81],  // Austin Reaves
    risacher: [68, 82, 70, 75, 85, 86, 79, 67],  // Zaccharie Risacher
    robwilliams: [38, 64, 35, 85, 90, 66, 78, 75],  // Robert Williams III
    rollins: [82, 86, 80, 60, 85, 84, 68, 80],  // Ryan Rollins
    rsheppard: [84, 89, 75, 70, 95, 91, 78, 87],  // Reed Sheppard
    rui: [67, 74, 85, 35, 85, 79, 54, 80],  // Rui Hachimura
    sabonis: [43, 49, 90, 60, 90, 68, 49, 54],  // Domantas Sabonis
    sarr: [66, 72, 80, 80, 85, 78, 72, 77],  // Alexandre Sarr
    sbey: [57, 72, 90, 65, 90, 83, 69, 70],  // Saddiq Bey
    scheierman: [75, 64, 70, 40, 85, 89, 56, 54],  // Baylor Scheierman
    schroder: [84, 88, 70, 60, 90, 81, 73, 74],  // Dennis Schröder
    scoot: [88, 89, 80, 50, 80, 68, 66, 90],  // Scoot Henderson
    sengun: [48, 64, 90, 65, 90, 91, 63, 69],  // Alperen Şengün
    sexton: [87, 88, 80, 50, 80, 81, 67, 84],  // Collin Sexton
    sga: [87, 86, 98, 85, 90, 84, 86, 85],  // Shai Gilgeous-Alexander
    shamet: [82, 85, 75, 35, 81, 71, 60, 80],  // Landry Shamet
    sharpe: [38, 61, 65, 60, 95, 79, 60, 73],  // Day'Ron Sharpe
    shead: [88, 94, 70, 50, 95, 91, 77, 74],  // Jamal Shead
    siakam: [69, 78, 85, 80, 80, 84, 79, 79],  // Pascal Siakam
    simons: [79, 89, 75, 40, 90, 77, 59, 90],  // Anfernee Simons
    sionjames: [78, 85, 65, 65, 80, 93, 72, 81],  // Sion James
    smart: [74, 89, 60, 85, 90, 73, 86, 83],  // Marcus Smart
    spencerj: [60, 64, 70, 50, 95, 82, 64, 68],  // Spencer Jones
    stirtz: [68, 70, 55, 40, 70, 80, 60, 69],  // Bennett Stirtz
    strus: [74, 76, 70, 50, 70, 58, 66, 74],  // Max Strus
    suggs: [86, 92, 50, 85, 85, 79, 89, 90],  // Jalen Suggs
    tatum: [79, 88, 95, 85, 98, 68, 85, 83],  // Jayson Tatum
    thj: [68, 75, 80, 40, 83, 82, 70, 78],  // Tim Hardaway Jr
    thybulle: [69, 85, 25, 85, 90, 61, 85, 70],  // Matisse Thybulle
    tmurphy: [74, 76, 90, 65, 85, 88, 69, 82],  // Trey Murphy III
    toppin: [56, 69, 60, 40, 70, 65, 48, 90],  // Obi Toppin
    trae: [84, 84, 95, 30, 75, 64, 55, 78],  // Trae Young
    traore: [85, 85, 80, 40, 80, 88, 60, 74],  // Nolan Traore
    trejohnson: [76, 82, 65, 55, 80, 81, 62, 86],  // Tre Johnson
    trejones: [80, 80, 85, 60, 75, 84, 73, 71],  // Tre Jones
    tshannon: [84, 87, 70, 50, 75, 71, 72, 83],  // Terrence Shannon Jr
    turner: [32, 66, 40, 85, 80, 83, 70, 69],  // Myles Turner
    tyson: [77, 76, 70, 60, 90, 83, 70, 75],  // Jaylon Tyson
    vanderbilt: [65, 83, 40, 80, 95, 78, 81, 80],  // Jarred Vanderbilt
    vassell: [65, 80, 75, 80, 85, 85, 80, 77],  // Devin Vassell
    wagler: [73, 72, 60, 55, 85, 80, 68, 76],  // Keaton Wagler
    walsh: [68, 81, 40, 80, 90, 86, 82, 86],  // Jordan Walsh
    ware: [46, 68, 60, 60, 90, 89, 37, 90],  // Kel'el Ware
    wcj: [47, 55, 60, 70, 90, 83, 47, 68],  // Wendell Carter Jr
    wemby: [64, 69, 98, 98, 98, 84, 80, 72],  // Victor Wembanyama
    white: [87, 93, 75, 95, 95, 84, 95, 75],  // Derrick White
    wiggins: [80, 82, 70, 65, 90, 82, 74, 97],  // Andrew Wiggins
    wolf: [47, 52, 75, 45, 85, 82, 55, 57],  // Danny Wolf
    youngblood: [63, 73, 45, 45, 80, 84, 64, 70],  // Chris Youngblood
    ziaire: [82, 87, 50, 70, 80, 80, 73, 82],  // Ziaire Williams
    zion: [74, 81, 85, 40, 95, 76, 55, 97],  // Zion Williamson
    zubac: [30, 63, 75, 95, 85, 76, 63, 75],  // Ivica Zubac
  }
};
