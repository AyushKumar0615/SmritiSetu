// All 28 Indian states + 8 Union Territories (alphabetical)
export const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

// Major Indian regional/official languages (constitutionally recognized),
// plus widely spoken Northeast Indian languages (Khasi, Garo, Mizo,
// Kokborok, Ao) that don't yet have dedicated dictionary entries — they
// fall back to English via LocalizationService.getText's existing fallback.
export const INDIAN_LANGUAGES = [
  { code: 'njo', name: 'Ao' },
  { code: 'as', name: 'Assamese' },
  { code: 'bn', name: 'Bengali' },
  { code: 'brx', name: 'Bodo' },
  { code: 'en', name: 'English' },
  { code: 'grt', name: 'Garo' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'hi', name: 'Hindi' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ks', name: 'Kashmiri' },
  { code: 'kha', name: 'Khasi' },
  { code: 'trp', name: 'Kokborok' },
  { code: 'kok', name: 'Konkani' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mni', name: 'Manipuri (Meitei)' },
  { code: 'mr', name: 'Marathi' },
  { code: 'lus', name: 'Mizo' },
  { code: 'ne', name: 'Nepali' },
  { code: 'or', name: 'Odia' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ur', name: 'Urdu' }
];

export const NER_STATES = {
  ASSAM: 'Assam',
  ARUNACHAL: 'Arunachal Pradesh',
  MANIPUR: 'Manipur',
  MEGHALAYA: 'Meghalaya',
  MIZORAM: 'Mizoram',
  NAGALAND: 'Nagaland',
  SIKKIM: 'Sikkim',
  TRIPURA: 'Tripura'
};

export const CULTURAL_CATALOG = {
  assam: {
    id: 'assam',
    name: 'Assam',
    language: 'Assamese',
    greeting: 'Nomoskar',
    crafts: ['Jaapi', 'Muga silk', 'Pepa', 'Tea leaves'],
    prompts: ['Rongali Bihu morning', 'Tea garden path', 'Family courtyard']
  },
  arunachal: { id: 'arunachal', name: 'Arunachal Pradesh', language: 'Nyishi/Apatani', greeting: 'Hello', crafts: ['Bamboo craft', 'Handwoven shawl'] },
  manipur: { id: 'manipur', name: 'Manipur', language: 'Meiteilon', greeting: 'Khurumjari', crafts: ['Phanek', 'Cane craft'] },
  meghalaya: { id: 'meghalaya', name: 'Meghalaya', language: 'Khasi/Garo', greeting: 'Khublei', crafts: ['Bamboo basket', 'Eri silk'] },
  mizoram: { id: 'mizoram', name: 'Mizoram', language: 'Mizo', greeting: 'Chibai', crafts: ['Puan cloth', 'Bamboo craft'] },
  nagaland: { id: 'nagaland', name: 'Nagaland', language: 'Nagamese/tribal languages', greeting: 'Hello', crafts: ['Naga shawl', 'Wood craft'] },
  sikkim: { id: 'sikkim', name: 'Sikkim', language: 'Nepali/Lepcha', greeting: 'Namaste', crafts: ['Prayer wheel', 'Thangka art'] },
  tripura: { id: 'tripura', name: 'Tripura', language: 'Kokborok/Bengali', greeting: 'Kwrwi', crafts: ['Bamboo mat', 'Handloom'] }
};

export const UI_COPY = {
  en: {
    greeting: 'Good morning, Kamala Devi',
    subGreeting: 'Your calm care plan is ready for today.',
    playGames: 'Play Memory Games',
    memories: 'My Family Memories',
    reminders: 'My Reminders'
  },
  hi: {
    greeting: 'Suprabhat, Kamala Devi',
    subGreeting: 'Aaj ka dekhbhal yojana taiyar hai.',
    playGames: 'Memory Games kheliye',
    memories: 'Meri Parivar Yaadein',
    reminders: 'Mere Reminders'
  },
  as: {
    greeting: 'Nomoskar, Kamala Devi',
    subGreeting: 'Aji apunar shanto care plan ready ase.',
    playGames: 'Memory Games',
    memories: 'Family Memories',
    reminders: 'Reminders'
  }
};
