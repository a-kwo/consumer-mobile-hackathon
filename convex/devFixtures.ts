/**
 * TEMPORARY demo library: 42 real songs with hand-written labels, for running
 * the app before the real pipeline output is imported. Not part of the product.
 * Delete this file once the real library is in.
 *
 *   npx convex run devFixtures:load "$(node -e 'console.log(JSON.stringify({vocab:require("./shared/vocab.json")}))')"
 *   npx convex run devFixtures:status
 *   npx convex run devFixtures:clear
 *
 * Safety: `load` refuses to run when `songs` has rows, or when `scenes` has
 * rows that are not fixtures. Every fixture row is marked (song `isrc` starts
 * with "FIXTURE:", scene `text` starts with "FIXTURE "), and `clear` deletes
 * only marked rows, and only songs with the deezerIds listed below. A real
 * import with `--replace` removes the fixtures by itself.
 *
 * BPMs are approximate, spread from 60 to 177. The embeddings are not from a
 * model: each vocabulary term gets a fixed random unit vector, a song is the sum
 * of its labels and a scene the sum of its hints in shared/vocab.json, so "rainy
 * night" still lands nearer the melancholy songs than the joyful ones.
 */
import { type Infer, v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { hashString, seededRandom } from './lib/hash';
import { sceneKey } from './lib/scene';
import { PACES, SETTINGS, TIMES_OF_DAY, WEATHERS } from './lib/validators';
import { EMBEDDING_DIMENSIONS } from './schema';

const SONG_MARK = 'FIXTURE:';
const SCENE_MARK = 'FIXTURE ';

type FixtureSong = {
  deezerId: number;
  isrc: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  bpm: number;
  energy: number;
  valence: number;
  moods: string[];
  scenes: string[];
  timeOfDay: string[];
};

// Looked up on Deezer on Nov 15 with plain "artist title" searches.
const SONGS: FixtureSong[] = [
  {
    deezerId: 982668,
    isrc: 'GBAQT9400064',
    title: 'Roads',
    artist: 'Portishead',
    album: 'Dummy',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/5942b88996f33c82790023d5d99395d3/500x500-000000-80-0-0.jpg',
    bpm: 60,
    energy: 0.3,
    valence: 0.25,
    moods: ['sultry', 'brooding', 'dark'],
    scenes: ['late night', 'after hours'],
    timeOfDay: ['night', 'evening'],
  },
  {
    deezerId: 1800691777,
    isrc: 'GBUM71107002',
    title: 'Video Games (Radio Edit)',
    artist: 'Lana Del Rey',
    album: 'Chill For Kids',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/6f0b205e7b947d8ec14bc9d55094db04/500x500-000000-80-0-0.jpg',
    bpm: 62,
    energy: 0.25,
    valence: 0.25,
    moods: ['melancholy', 'nostalgic', 'romantic'],
    scenes: ['heartbreak', 'late night'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 3221436041,
    isrc: 'US64G2509905',
    title: 'Mystery Of Love (Demo)',
    artist: 'Sufjan Stevens',
    album: 'Mystery Of Love (Demo)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/3c4eb32ab32723339f5dcf6eb0f8d7be/500x500-000000-80-0-0.jpg',
    bpm: 66,
    energy: 0.25,
    valence: 0.45,
    moods: ['tender', 'dreamy', 'nostalgic'],
    scenes: ['nature walk', 'sunday morning'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 75009998,
    isrc: 'TCABB1109123',
    title: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    album: 'Gymnopédies',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/29e7eed1c4a83283ca354f6541fd56f6/500x500-000000-80-0-0.jpg',
    bpm: 68,
    energy: 0.08,
    valence: 0.35,
    moods: ['calm', 'reflective', 'melancholy'],
    scenes: ['focus', 'rainy day', 'wind down'],
    timeOfDay: ['morning', 'night'],
  },
  {
    deezerId: 1503949292,
    isrc: 'SE6XX2109388',
    title: 'Beach House Space Song',
    artist: 'Cigarettiquette',
    album: 'Nano Heart',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/57d6e10e482a3a2e55aa64ce13c9cc7f/500x500-000000-80-0-0.jpg',
    bpm: 73,
    energy: 0.35,
    valence: 0.35,
    moods: ['dreamy', 'ethereal', 'bittersweet'],
    scenes: ['stargazing', 'night drive'],
    timeOfDay: ['night', 'evening'],
  },
  {
    deezerId: 75812668,
    isrc: 'US38Y1113503',
    title: 'Holocene',
    artist: 'Bon Iver',
    album: 'Bon Iver, Bon Iver',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/1457f0d27076538d484625fa706541b7/500x500-000000-80-0-0.jpg',
    bpm: 74,
    energy: 0.3,
    valence: 0.3,
    moods: ['reflective', 'ethereal', 'melancholy'],
    scenes: ['nature walk', 'snow day'],
    timeOfDay: ['morning', 'evening'],
  },
  {
    deezerId: 3387709641,
    isrc: 'GBAAA9800322',
    title: 'Teardrop',
    artist: 'Massive Attack',
    album: 'Teardrop',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/a5c29fcad2e22bdfbcb857c7bede785b/500x500-000000-80-0-0.jpg',
    bpm: 76,
    energy: 0.35,
    valence: 0.3,
    moods: ['mysterious', 'brooding', 'ethereal'],
    scenes: ['late night', 'rainy day'],
    timeOfDay: ['night'],
  },
  {
    deezerId: 138539157,
    isrc: 'GBAYE9700386',
    title: 'No Surprises',
    artist: 'Radiohead',
    album: 'No Surprises',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/7a378976d3ff1b1fd7b21ee0c7f95fa5/500x500-000000-80-0-0.jpg',
    bpm: 77,
    energy: 0.3,
    valence: 0.35,
    moods: ['melancholy', 'tender', 'bittersweet'],
    scenes: ['rainy day', 'wind down'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 3360821,
    isrc: 'USCA29300105',
    title: 'Fade Into You',
    artist: 'Mazzy Star',
    album: 'So Tonight That I Might See',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/5d3703e81301662626cc06a8b2843c78/500x500-000000-80-0-0.jpg',
    bpm: 78,
    energy: 0.25,
    valence: 0.3,
    moods: ['dreamy', 'romantic', 'melancholy'],
    scenes: ['late night', 'heartbreak'],
    timeOfDay: ['night', 'evening'],
  },
  {
    deezerId: 717273862,
    isrc: 'QZ5C81600003',
    title: 'Pink + White',
    artist: 'Frank Ocean',
    album: 'Blonde',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/f798a866107715dd6dc1049e498ce21f/500x500-000000-80-0-0.jpg',
    bpm: 80,
    energy: 0.45,
    valence: 0.6,
    moods: ['warm', 'nostalgic', 'dreamy'],
    scenes: ['golden hour', 'sunday morning'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 655095962,
    isrc: 'USUM71815958',
    title: 'when the party\'s over',
    artist: 'Billie Eilish',
    album: 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/6630083f454d48eadb6a9b53f035d734/500x500-000000-80-0-0.jpg',
    bpm: 82,
    energy: 0.15,
    valence: 0.2,
    moods: ['lonely', 'melancholy', 'tender'],
    scenes: ['heartbreak', 'late night'],
    timeOfDay: ['night'],
  },
  {
    deezerId: 70322130,
    isrc: 'GBCEL1300362',
    title: 'Do I Wanna Know?',
    artist: 'Arctic Monkeys',
    album: 'AM',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/64e54e307bd5e2bdb27ffeb662fd910d/500x500-000000-80-0-0.jpg',
    bpm: 85,
    energy: 0.55,
    valence: 0.4,
    moods: ['sultry', 'brooding', 'confident'],
    scenes: ['night drive', 'late night'],
    timeOfDay: ['night', 'evening'],
  },
  {
    deezerId: 1379123002,
    isrc: 'GBAAN7200021',
    title: 'Pink Moon',
    artist: 'Nick Drake',
    album: 'Pink Moon',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/6829c0844fd6a12923e991503be7db41/500x500-000000-80-0-0.jpg',
    bpm: 86,
    energy: 0.2,
    valence: 0.4,
    moods: ['calm', 'reflective', 'tender'],
    scenes: ['sunday morning', 'nature walk'],
    timeOfDay: ['morning'],
  },
  {
    deezerId: 3155839,
    isrc: 'USBN20100529',
    title: 'Don\'t Know Why',
    artist: 'Norah Jones',
    album: 'Don\'t Know Why',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/d4cb6f8663af84d1db08a41a019065a0/500x500-000000-80-0-0.jpg',
    bpm: 88,
    energy: 0.2,
    valence: 0.45,
    moods: ['cozy', 'warm', 'tender'],
    scenes: ['coffee shop', 'cozy indoors', 'rainy day'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 62496771,
    isrc: 'FRS710900410',
    title: 'Nightcall',
    artist: 'Kavinsky',
    album: 'Nightcall',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/7f9ecda862091716e4e8f74a7e115f93/500x500-000000-80-0-0.jpg',
    bpm: 91,
    energy: 0.5,
    valence: 0.35,
    moods: ['mysterious', 'cinematic', 'dark'],
    scenes: ['night drive', 'after hours'],
    timeOfDay: ['night'],
  },
  {
    deezerId: 144010758,
    isrc: 'USBQU1700034',
    title: 'Apocalypse',
    artist: 'Cigarettes After Sex',
    album: 'Cigarettes After Sex',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/2db20377876da16feb8ec9652e835a81/500x500-000000-80-0-0.jpg',
    bpm: 94,
    energy: 0.25,
    valence: 0.3,
    moods: ['dreamy', 'romantic', 'lonely'],
    scenes: ['late night', 'stargazing'],
    timeOfDay: ['night'],
  },
  {
    deezerId: 857206512,
    isrc: 'USAT21905910',
    title: 'Good as Hell (feat. Ariana Grande)',
    artist: 'Lizzo',
    album: 'Cuz I Love You (Super Deluxe)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/419a4cfd05a8d4b9bcb088369b85e591/500x500-000000-80-0-0.jpg',
    bpm: 96,
    energy: 0.75,
    valence: 0.9,
    moods: ['confident', 'joyful', 'playful'],
    scenes: ['getting ready', 'main character moment'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 70016835,
    isrc: 'USSM10207844',
    title: 'Lovely Day',
    artist: 'Bill Withers',
    album: 'The Essential Bill Withers',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/a21685522410a1b07d544a79ca4e4b7a/500x500-000000-80-0-0.jpg',
    bpm: 98,
    energy: 0.55,
    valence: 0.85,
    moods: ['warm', 'joyful', 'hopeful'],
    scenes: ['sunday morning', 'city walk'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 3787855,
    isrc: 'GBBKS0900196',
    title: 'Intro',
    artist: 'The xx',
    album: 'xx',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/7037869230e2fbf86b91ec1b4c7e8b8d/500x500-000000-80-0-0.jpg',
    bpm: 100,
    energy: 0.4,
    valence: 0.4,
    moods: ['mysterious', 'cinematic', 'reflective'],
    scenes: ['city walk', 'night drive'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 596034702,
    isrc: 'USMO10000310',
    title: 'Superstition',
    artist: 'Stevie Wonder',
    album: 'Number 1\'s',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/dc11aaf0240dbaf1548639e1c5df8db8/500x500-000000-80-0-0.jpg',
    bpm: 101,
    energy: 0.8,
    valence: 0.85,
    moods: ['groovy', 'confident', 'playful'],
    scenes: ['city walk', 'party'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 1124841682,
    isrc: 'GBAHT1901299',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/f8364f090ba04f1b19b381ec0390f3e4/500x500-000000-80-0-0.jpg',
    bpm: 103,
    energy: 0.8,
    valence: 0.9,
    moods: ['joyful', 'groovy', 'playful'],
    scenes: ['getting ready', 'party'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 92198180,
    isrc: 'GB55H1100002',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Midnight City (Remix EP)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/17116bb5bc20e30d915e569ec750f78d/500x500-000000-80-0-0.jpg',
    bpm: 105,
    energy: 0.75,
    valence: 0.6,
    moods: ['euphoric', 'cinematic', 'nostalgic'],
    scenes: ['night drive', 'main character moment'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 576431,
    isrc: 'USVR19600010',
    title: 'Eye of the Tiger',
    artist: 'Survivor',
    album: 'Rocky IV',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/e66b5d3a40f69690c1633afb73cc590c/500x500-000000-80-0-0.jpg',
    bpm: 109,
    energy: 0.85,
    valence: 0.6,
    moods: ['triumphant', 'driving', 'confident'],
    scenes: ['workout', 'victory lap'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 66609426,
    isrc: 'USQX91300809',
    title: 'Get Lucky (Radio Edit - feat. Pharrell Williams and Nile Rodgers)',
    artist: 'Daft Punk',
    album: 'Get Lucky (Radio Edit - feat. Pharrell Williams and Nile Rodgers)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/bc49adb87758e0c8c4e508a9c5cce85d/500x500-000000-80-0-0.jpg',
    bpm: 116,
    energy: 0.75,
    valence: 0.85,
    moods: ['groovy', 'joyful', 'sultry'],
    scenes: ['party', 'golden hour'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 103052662,
    isrc: 'AUUM71500303',
    title: 'The Less I Know The Better',
    artist: 'Tame Impala',
    album: 'Currents',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/de5b9b704cd4ec36f8bf49beb3e17ba2/500x500-000000-80-0-0.jpg',
    bpm: 117,
    energy: 0.7,
    valence: 0.75,
    moods: ['groovy', 'bittersweet', 'playful'],
    scenes: ['city walk', 'main character moment'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 1763241437,
    isrc: 'SEWKZ1000056',
    title: 'Dancing On My Own (Rex The Dog Remix Edit)',
    artist: 'Robyn',
    album: 'Dancing On My Own (Remixes)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/1ea48f3857945b3001a58ab8c1f40721/500x500-000000-80-0-0.jpg',
    bpm: 118,
    energy: 0.8,
    valence: 0.45,
    moods: ['bittersweet', 'euphoric', 'lonely'],
    scenes: ['heartbreak', 'party'],
    timeOfDay: ['night'],
  },
  {
    deezerId: 63480987,
    isrc: 'USWB10400046',
    title: 'Dreams (2004 Remaster)',
    artist: 'Fleetwood Mac',
    album: 'Rumours',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/9732751ce91d786dcf30069853697078/500x500-000000-80-0-0.jpg',
    bpm: 120,
    energy: 0.5,
    valence: 0.75,
    moods: ['nostalgic', 'warm', 'reflective'],
    scenes: ['road trip', 'golden hour'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 13040253,
    isrc: 'GBARL1100749',
    title: 'Feel So Close (Extended Mix)',
    artist: 'Calvin Harris',
    album: 'Feel So Close',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/d45400b10f16a8433f85b5ddef3bfafb/500x500-000000-80-0-0.jpg',
    bpm: 128,
    energy: 0.9,
    valence: 0.75,
    moods: ['euphoric', 'energetic', 'joyful'],
    scenes: ['party', 'workout'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 3102130,
    isrc: 'GBAYE9600015',
    title: 'Song 2',
    artist: 'Blur',
    album: 'Blur: The Best Of',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/1e6f6130ca0ccbdd0cde4dc2b05e6df9/500x500-000000-80-0-0.jpg',
    bpm: 130,
    energy: 0.95,
    valence: 0.7,
    moods: ['rebellious', 'energetic', 'playful'],
    scenes: ['workout', 'pregame'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 3157972,
    isrc: 'GBAYE0800265',
    title: 'Viva La Vida',
    artist: 'Coldplay',
    album: 'Viva La Vida or Death and All His Friends',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/eede3cd0dc3a5a87c7a5b1085b022e2d/500x500-000000-80-0-0.jpg',
    bpm: 138,
    energy: 0.7,
    valence: 0.55,
    moods: ['epic', 'triumphant', 'cinematic'],
    scenes: ['main character moment', 'road trip'],
    timeOfDay: ['afternoon', 'evening'],
  },
  {
    deezerId: 3129407,
    isrc: 'GBAYE0500172',
    title: 'Feel Good Inc.',
    artist: 'Gorillaz',
    album: 'Demon Days',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/3dc29a565149240729afc08e1f251b46/500x500-000000-80-0-0.jpg',
    bpm: 139,
    energy: 0.7,
    valence: 0.7,
    moods: ['groovy', 'playful', 'rebellious'],
    scenes: ['city walk', 'commute'],
    timeOfDay: ['afternoon'],
  },
  {
    deezerId: 3110852,
    isrc: 'US4GE0600018',
    title: 'All My Friends',
    artist: 'LCD Soundsystem',
    album: 'Sound of Silver',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/d5aec97cfc1581df6b32a267fe067827/500x500-000000-80-0-0.jpg',
    bpm: 143,
    energy: 0.85,
    valence: 0.6,
    moods: ['nostalgic', 'euphoric', 'driving'],
    scenes: ['running', 'night drive'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 3026048721,
    isrc: 'FR31Q0900002',
    title: '1901',
    artist: 'Phoenix',
    album: 'Wolfgang Amadeus Phoenix',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/c3bb90a6b2f333c1510a876236bacf0c/500x500-000000-80-0-0.jpg',
    bpm: 144,
    energy: 0.85,
    valence: 0.75,
    moods: ['energetic', 'joyful', 'driving'],
    scenes: ['running', 'city walk'],
    timeOfDay: ['afternoon', 'morning'],
  },
  {
    deezerId: 132635408,
    isrc: 'USSM17500423',
    title: 'Born to Run',
    artist: 'Bruce Springsteen',
    album: 'Chapter and Verse',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/c071343c0d0e73ceec13218e08f28aae/500x500-000000-80-0-0.jpg',
    bpm: 147,
    energy: 0.95,
    valence: 0.65,
    moods: ['triumphant', 'epic', 'rebellious'],
    scenes: ['running', 'road trip'],
    timeOfDay: ['evening', 'morning'],
  },
  {
    deezerId: 689411472,
    isrc: 'USIR20500155',
    title: 'Mr. Brightside (Jacques Lu Cont\'s Thin White Duke Radio Remix)',
    artist: 'The Killers',
    album: 'Mr. Brightside (Remixes)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/0690d69d27f0d718fcc95f23af702286/500x500-000000-80-0-0.jpg',
    bpm: 148,
    energy: 0.92,
    valence: 0.5,
    moods: ['energetic', 'driving', 'rebellious'],
    scenes: ['running', 'party'],
    timeOfDay: ['evening', 'night'],
  },
  {
    deezerId: 7561772,
    isrc: 'GBUM70900209',
    title: 'Dog Days Are Over',
    artist: 'Florence + The Machine',
    album: 'Between Two Lungs',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/e4975860d7e182195ec9fb1464676b94/500x500-000000-80-0-0.jpg',
    bpm: 150,
    energy: 0.85,
    valence: 0.7,
    moods: ['triumphant', 'euphoric', 'hopeful'],
    scenes: ['running', 'sunrise'],
    timeOfDay: ['morning'],
  },
  {
    deezerId: 4092329741,
    isrc: 'GBUM71029610',
    title: 'Don\'t Stop Me Now',
    artist: 'Queen',
    album: 'Jazz',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/4b8ab9c1f112b63c07e3983b98e98006/500x500-000000-80-0-0.jpg',
    bpm: 156,
    energy: 0.9,
    valence: 0.9,
    moods: ['euphoric', 'joyful', 'triumphant'],
    scenes: ['running', 'victory lap'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 4762041,
    isrc: 'USRW29600011',
    title: 'Everlong',
    artist: 'Foo Fighters',
    album: 'Greatest Hits',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/266f01f1c7a04843d11cd08f9c07d11f/500x500-000000-80-0-0.jpg',
    bpm: 158,
    energy: 0.92,
    valence: 0.45,
    moods: ['driving', 'energetic', 'bittersweet'],
    scenes: ['running', 'workout'],
    timeOfDay: ['evening', 'morning'],
  },
  {
    deezerId: 701326562,
    isrc: 'USQ4E1300686',
    title: 'Happy (From "Despicable Me 2")',
    artist: 'Pharrell Williams',
    album: 'G I R L',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/a1939a9a40dc97ed404cc4597c6a32bc/500x500-000000-80-0-0.jpg',
    bpm: 160,
    energy: 0.8,
    valence: 0.95,
    moods: ['joyful', 'playful', 'hopeful'],
    scenes: ['running', 'sunday morning'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 432951302,
    isrc: 'DEUM71724939',
    title: 'Take On Me (2017 Acoustic)',
    artist: 'a-ha',
    album: 'Take On Me (2017 Acoustic)',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/1a28cc1fde787f09921e900ac60c84bf/500x500-000000-80-0-0.jpg',
    bpm: 169,
    energy: 0.9,
    valence: 0.85,
    moods: ['joyful', 'nostalgic', 'energetic'],
    scenes: ['running', 'workout'],
    timeOfDay: ['morning', 'afternoon'],
  },
  {
    deezerId: 908604612,
    isrc: 'USUG11904206',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/fd00ebd6d30d7253f813dba3bb1c66a9/500x500-000000-80-0-0.jpg',
    bpm: 171,
    energy: 0.8,
    valence: 0.4,
    moods: ['driving', 'nostalgic', 'dark'],
    scenes: ['running', 'night drive'],
    timeOfDay: ['night', 'evening'],
  },
  {
    deezerId: 14618524,
    isrc: 'USWB10201776',
    title: 'Blitzkrieg Bop (1999 Remaster)',
    artist: 'Ramones',
    album: 'Greatest Hits',
    coverUrl: 'https://cdn-images.dzcdn.net/images/cover/cc0c69196d44c6ea479dcc48aef2464a/500x500-000000-80-0-0.jpg',
    bpm: 177,
    energy: 0.95,
    valence: 0.8,
    moods: ['rebellious', 'energetic', 'playful'],
    scenes: ['running', 'pregame'],
    timeOfDay: ['afternoon', 'evening'],
  },
];

/** A fixed pseudo-random unit vector for a vocabulary term. */
function termVector(term: string): number[] {
  const random = seededRandom(hashString(`term:${term}`));
  return normalize(Array.from({ length: EMBEDDING_DIMENSIONS }, () => random() * 2 - 1));
}

function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / length);
}

function sumVectors(terms: string[], noiseSeed: string, noise: number): number[] {
  const total = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const add = (vector: number[], weight: number) => vector.forEach((value, i) => (total[i] += value * weight));
  for (const term of terms) add(termVector(term), 1);
  add(termVector(`noise:${noiseSeed}`), noise);
  return normalize(total);
}

const sceneRowV = v.object({ key: v.string(), text: v.string(), embedding: v.array(v.float64()) });

/** How much of the library is fixtures. Bounded reads: enough to tell 42 songs from the real library. */
export const status = internalQuery({
  args: {},
  returns: v.object({ songs: v.number(), fixtureSongs: v.number(), scenes: v.number(), fixtureScenes: v.number() }),
  handler: async (ctx) => {
    const songs = await ctx.db.query('songs').take(200);
    const scenes = await ctx.db.query('scenes').take(900);
    return {
      songs: songs.length,
      fixtureSongs: songs.filter((song) => song.isrc?.startsWith(SONG_MARK)).length,
      scenes: scenes.length,
      fixtureScenes: scenes.filter((scene) => scene.text.startsWith(SCENE_MARK)).length,
    };
  },
});

export const insertSongs = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (await ctx.db.query('songs').first()) throw new Error('songs already has rows: refusing to load fixtures');
    for (const song of SONGS) {
      const { moods, scenes, timeOfDay, energy, valence } = song;
      await ctx.db.insert('songs', {
        ...song,
        isrc: `${SONG_MARK}${song.isrc}`,
        tension: Math.round((1 - valence) * energy * 100) / 100,
        social: energy > 0.7 ? 0.7 : 0.3,
        vocal: 0.7,
        confidence: 0.9,
        embedding: sumVectors([...moods, ...scenes, ...timeOfDay.map((id) => `time:${id}`)], `song:${song.deezerId}`, 0.6),
      });
    }
    return SONGS.length;
  },
});

export const insertScenes = internalMutation({
  args: { rows: v.array(sceneRowV), first: v.boolean() },
  returns: v.number(),
  handler: async (ctx, { rows, first }) => {
    const existing = await ctx.db.query('scenes').first();
    // The first batch needs an empty table; later batches only ever follow fixture rows.
    if (existing && (first || !existing.text.startsWith(SCENE_MARK))) {
      throw new Error('scenes already has rows: refusing to load fixtures');
    }
    for (const row of rows) {
      if (!row.text.startsWith(SCENE_MARK)) throw new Error('fixture scenes must carry the FIXTURE mark');
      await ctx.db.insert('scenes', row);
    }
    return rows.length;
  },
});

type Hints = { id: string; moodHints: string[]; tagHints: string[] };

/** Loads the 42 songs and all 840 scene rows. `vocab` is the contents of shared/vocab.json. */
export const load = internalAction({
  args: { vocab: v.any() },
  returns: v.object({ songs: v.number(), scenes: v.number() }),
  handler: async (ctx, { vocab }): Promise<{ songs: number; scenes: number }> => {
    const before: { songs: number; scenes: number } = await ctx.runQuery(internal.devFixtures.status, {});
    if (before.songs > 0 || before.scenes > 0) throw new Error('library is not empty: refusing to load fixtures');

    const hints = (list: Hints[]) => new Map(list.map((entry) => [entry.id, entry]));
    const parts = [hints(vocab.paces), hints(vocab.weathers), hints(vocab.timesOfDay), hints(vocab.settings)];
    const sceneRows: Infer<typeof sceneRowV>[] = [];
    for (const pace of PACES) {
      for (const weather of WEATHERS) {
        for (const time of TIMES_OF_DAY) {
          for (const setting of SETTINGS) {
            const ids = [pace, weather, time, setting];
            const terms = ids.flatMap((id, i) => [
              ...(parts[i].get(id)?.moodHints ?? []),
              ...(parts[i].get(id)?.tagHints ?? []),
            ]);
            const key = sceneKey(pace, weather, time, setting);
            sceneRows.push({
              key,
              text: `${SCENE_MARK}${terms.join(', ')}`,
              embedding: sumVectors([...terms, `time:${time}`], `scene:${key}`, 0.3),
            });
          }
        }
      }
    }

    const songs: number = await ctx.runMutation(internal.devFixtures.insertSongs, {});
    let scenes = 0;
    for (let start = 0; start < sceneRows.length; start += 140) {
      scenes += await ctx.runMutation(internal.devFixtures.insertScenes, {
        rows: sceneRows.slice(start, start + 140),
        first: start === 0,
      });
    }
    return { songs, scenes };
  },
});

/**
 * Deletes the fixture songs and fixture scenes, and nothing else. `deezerIds`
 * adds ids to check beyond the built-in list; unmarked rows are always kept.
 */
export const clear = internalMutation({
  args: { deezerIds: v.optional(v.array(v.number())) },
  returns: v.object({ songs: v.number(), scenes: v.number(), keptRealSongs: v.number() }),
  handler: async (ctx, { deezerIds }) => {
    let songs = 0;
    let keptRealSongs = 0;
    for (const deezerId of new Set([...SONGS.map((song) => song.deezerId), ...(deezerIds ?? [])])) {
      const rows = await ctx.db
        .query('songs')
        .withIndex('by_deezerId', (q) => q.eq('deezerId', deezerId))
        .take(8);
      for (const row of rows) {
        // A real song can share a deezerId with a fixture one. Only marked rows go.
        if (!row.isrc?.startsWith(SONG_MARK)) {
          keptRealSongs += 1;
          continue;
        }
        await ctx.db.delete('songs', row._id);
        songs += 1;
      }
    }
    let scenes = 0;
    for (const row of await ctx.db.query('scenes').take(2000)) {
      if (!row.text.startsWith(SCENE_MARK)) continue;
      await ctx.db.delete('scenes', row._id);
      scenes += 1;
    }
    return { songs, scenes, keptRealSongs };
  },
});
