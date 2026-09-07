const BLOCKED = [
  'chink',
  'coon',
  'faggot',
  'gook',
  'kike',
  'nigga',
  'nigger',
  'retard',
  'spic',
  'tranny',
  'wetback',
];

const LEET: Record<string, string> = {
  a: 'a@4',
  b: 'b8',
  e: 'e3',
  g: 'g69',
  i: 'i1!|',
  o: 'o0',
  s: 's5$',
  t: 't7',
};

function fold(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function letterClass(letter: string) {
  return `[${(LEET[letter] ?? letter).replace(/[\\^\-\]]/g, '\\$&')}]`;
}

function wordPattern(word: string) {
  return new RegExp(`(?<![a-z0-9])${[...word].map(letterClass).join('[^a-z0-9]*')}(?![a-z0-9])`, 'iu');
}

const PATTERNS = BLOCKED.flatMap((word) => {
  const patterns = [wordPattern(word)];
  if (!word.endsWith('s')) patterns.push(wordPattern(`${word}s`));
  if (word === 'retard') patterns.push(wordPattern('retarded'));
  if (word === 'tranny') patterns.push(wordPattern('trannies'));
  return patterns;
});

export function blockedForGallery(value: string) {
  const text = fold(value);
  return PATTERNS.some((pattern) => pattern.test(text));
}
