import type { Metadata } from "next";
import StopPage from "./StopScreen";

export const metadata: Metadata = {
  title: "Bus stop — Pathsathi",
  description:
    "Every bus that passes this Kolkata stop, next buses and the whole day, from the published timetable. Works offline.",
};

export default function Page() {
  return <StopPage />;
}
