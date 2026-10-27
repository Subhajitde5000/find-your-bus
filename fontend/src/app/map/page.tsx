import type { Metadata } from "next";
import { MapPageShell } from "./MapPageShell";

export const metadata: Metadata = {
  title: "Stop map — KonBus",
  description: "Every Kolkata bus stop on one offline map: find the nearest stop, see which buses stop there, and search by name.",
};

export default function MapPage() {
  return <MapPageShell />;
}
