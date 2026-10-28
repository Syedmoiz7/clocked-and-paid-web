const QUOTES = [
  {
    text: "Every hour you put in is an hour toward the life you want.",
    author: "Unknown",
  },
  {
    text: "Work hard in silence. Let your paycheck make the noise.",
    author: "Unknown",
  },
  {
    text: "Small consistent effort beats occasional brilliance every time.",
    author: "Unknown",
  },
  {
    text: "You are one good shift away from changing everything.",
    author: "Unknown",
  },
  { text: "The clock is ticking. Make each minute count.", author: "Unknown" },
  {
    text: "Discipline is choosing what you want most over what you want now.",
    author: "Abraham Lincoln",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
  },
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius",
  },
  {
    text: "Success is the sum of small efforts repeated day in and day out.",
    author: "Robert Collier",
  },
  {
    text: "Hard work beats talent when talent does not work hard.",
    author: "Tim Notke",
  },
  {
    text: "Your income is directly tied to your effort. Show up fully.",
    author: "Unknown",
  },
  {
    text: "The difference between ordinary and extraordinary is that little extra.",
    author: "Jimmy Johnson",
  },
  {
    text: "Today is another chance to get better at what you do.",
    author: "Unknown",
  },
  { text: "Do the work nobody else is willing to do.", author: "Unknown" },
  {
    text: "Your future self is watching you right now. Make them proud.",
    author: "Unknown",
  },
  { text: "A day's work honestly done is its own reward.", author: "Unknown" },
  {
    text: "Invest in hours today that pay dividends tomorrow.",
    author: "Unknown",
  },
  {
    text: "No great achievement was ever built without consistent work.",
    author: "Unknown",
  },
  {
    text: "Clocking in is the first act of commitment. Everything else follows.",
    author: "Unknown",
  },
  {
    text: "Even your quietest day at work is a step forward.",
    author: "Unknown",
  },
  {
    text: "Show up. Do the work. Go home. Repeat. That is how you win.",
    author: "Unknown",
  },
  {
    text: "The grind you put in today is the stability you enjoy tomorrow.",
    author: "Unknown",
  },
  {
    text: "Every paycheck is proof that your effort has value.",
    author: "Unknown",
  },
  {
    text: "Be the kind of worker future-you looks back on with pride.",
    author: "Unknown",
  },
  {
    text: "Excellence is not a destination. It is a continuous journey.",
    author: "Brian Tracy",
  },
  {
    text: "The expert in anything was once a beginner who kept showing up.",
    author: "Helen Hayes",
  },
  {
    text: "A good worker does not watch the clock, but the work.",
    author: "Unknown",
  },
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe",
  },
  {
    text: "Push through today. Your bank account will thank you.",
    author: "Unknown",
  },
  {
    text: "One focused shift changes nothing. Thirty changes everything.",
    author: "Unknown",
  },
];

export const QUOTE_COUNT = QUOTES.length;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a daily quote for the given user and date, shifted by `offset`.
 * Same user + date + offset always returns the same quote.
 * offset=0 is the "default daily" quote; ±N navigates through the list.
 */
export function getDailyQuote(
  userId: string,
  dateString: string,
  offset = 0,
): { text: string; author: string } {
  const key = `${userId}-${dateString}`;
  const base = simpleHash(key) % QUOTES.length;
  const index =
    (((base + offset) % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[index]!;
}
