import { hexToBytes, sha256, stringToHex } from "viem";

/// One picture of a fingerprint, and the word it is read out as.
export interface FingerprintMark {
  emoji: string;
  name: string;
}

/// The 64 emoji of Matrix's device verification, a set chosen to stay distinct across platforms
/// and to have one obvious name each. The order is part of the fingerprint: never reorder it.
const MARKS: readonly (readonly [emoji: string, name: string])[] = [
  ["🐶", "Dog"],
  ["🐱", "Cat"],
  ["🦁", "Lion"],
  ["🐎", "Horse"],
  ["🦄", "Unicorn"],
  ["🐷", "Pig"],
  ["🐘", "Elephant"],
  ["🐰", "Rabbit"],
  ["🐼", "Panda"],
  ["🐓", "Rooster"],
  ["🐧", "Penguin"],
  ["🐢", "Turtle"],
  ["🐟", "Fish"],
  ["🐙", "Octopus"],
  ["🦋", "Butterfly"],
  ["🌷", "Flower"],
  ["🌳", "Tree"],
  ["🌵", "Cactus"],
  ["🍄", "Mushroom"],
  ["🌏", "Globe"],
  ["🌙", "Moon"],
  ["☁️", "Cloud"],
  ["🔥", "Fire"],
  ["🍌", "Banana"],
  ["🍎", "Apple"],
  ["🍓", "Strawberry"],
  ["🌽", "Corn"],
  ["🍕", "Pizza"],
  ["🎂", "Cake"],
  ["❤️", "Heart"],
  ["😀", "Smiley"],
  ["🤖", "Robot"],
  ["🎩", "Hat"],
  ["👓", "Glasses"],
  ["🔧", "Spanner"],
  ["🎅", "Santa"],
  ["👍", "Thumbs up"],
  ["☂️", "Umbrella"],
  ["⌛", "Hourglass"],
  ["⏰", "Clock"],
  ["🎁", "Gift"],
  ["💡", "Light bulb"],
  ["📕", "Book"],
  ["✏️", "Pencil"],
  ["📎", "Paperclip"],
  ["✂️", "Scissors"],
  ["🔒", "Lock"],
  ["🔑", "Key"],
  ["🔨", "Hammer"],
  ["☎️", "Telephone"],
  ["🏁", "Flag"],
  ["🚂", "Train"],
  ["🚲", "Bicycle"],
  ["✈️", "Aeroplane"],
  ["🚀", "Rocket"],
  ["🏆", "Trophy"],
  ["⚽", "Ball"],
  ["🎸", "Guitar"],
  ["🎺", "Trumpet"],
  ["🔔", "Bell"],
  ["⚓", "Anchor"],
  ["🎧", "Headphones"],
  ["📁", "Folder"],
  ["📌", "Pin"],
];

const DOMAIN = "lelantos:address-fingerprint:v1:";
const LENGTH = 16;
/// Bits one mark carries: `MARKS` holds 2^6.
const MARK_BITS = 6;

/// A shielded address as sixteen pictures, which two people compare in place of the address
/// itself. It carries 96 bits, so an address made to match one of a million known fingerprints
/// still takes some 2^76 tries. Casing does not change it.
export function addressFingerprint(address: string): FingerprintMark[] {
  const digest = hexToBytes(sha256(stringToHex(DOMAIN + address.toLowerCase())));
  let bits = 0n;
  for (const byte of digest.subarray(0, (LENGTH * MARK_BITS) / 8))
    bits = (bits << 8n) | BigInt(byte);
  return Array.from({ length: LENGTH }, (_, i) => {
    const index = Number((bits >> BigInt((LENGTH - 1 - i) * MARK_BITS)) & 63n);
    const [emoji, name] = MARKS[index] as (typeof MARKS)[number];
    return { emoji, name };
  });
}
