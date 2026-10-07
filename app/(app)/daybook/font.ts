import { Kalam } from "next/font/google";

// A handwriting face with both Devanagari and Latin letters, so the book reads as written by hand
// in either language. Loaded only where the day book is shown.
export const kalam = Kalam({
  weight: ["300", "400", "700"],
  subsets: ["devanagari", "latin"],
  variable: "--font-kalam",
});
