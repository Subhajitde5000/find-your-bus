import type { Metadata } from "next";
import OnBusPage from "./OnBusScreen";

export const metadata: Metadata = {
  title: "On bus — KonBus",
  description:
    "Scanned the QR inside a bus? KonBus matches your position and this route's timetable to say which bus you are in, and counts down to your stop.",
};

export default function Page() {
  return <OnBusPage />;
}
