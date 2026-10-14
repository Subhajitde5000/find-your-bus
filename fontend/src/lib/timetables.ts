export type ServiceType = "AC" | "Non-AC";
export type Operator = "WBTC" | "Private";

interface RouteTemplate {
  number: string;
  operator: Operator;
  type: ServiceType;
  stops: string[];
  legs: number[];
  first: string;
  last: string;
  every: number;
  reverseOffset?: number;
}

export interface JourneyStop {
  name: string;
  minutes: number;
  role: "boarding" | "intermediate" | "alighting";
}

export interface RouteStop {
  name: string;
  minutes: number;
  /** true when the stop sits between the searched boarding and alighting stops */
  journey: boolean;
}

export interface BusTrip {
  id: string;
  number: string;
  operator: Operator;
  type: ServiceType;
  terminusFrom: string;
  terminusTo: string;
  boarding: string;
  alighting: string;
  departure: number;
  arrival: number;
  duration: number;
  via: string[];
  journeyStops: JourneyStop[];
  /** every stop on the route with its scheduled clock time for this trip */
  fullStops: RouteStop[];
  /** minutes between departures */
  headway: number;
  serviceStart: number;
  serviceEnd: number;
}

// Illustrative, locally preloaded departure times for a frontend preview.
// Route corridors reflect familiar Kolkata bus connections; these are not official schedules.
const routes: RouteTemplate[] = [
  {
    number: "S5", operator: "WBTC", type: "Non-AC",
    stops: ["Garia", "Baghajatin", "Jadavpur", "Dhakuria", "Gariahat", "Rashbehari", "Hazra", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [8, 9, 7, 7, 6, 7, 11, 7, 6, 13], first: "05:35", last: "21:15", every: 20, reverseOffset: 10,
  },
  {
    number: "AC5", operator: "WBTC", type: "AC",
    stops: ["Garia", "Baghajatin", "Jadavpur", "Gariahat", "Rashbehari", "Hazra", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [10, 10, 11, 8, 9, 11, 7, 6, 13], first: "06:05", last: "20:45", every: 35, reverseOffset: 15,
  },
  {
    number: "AC6", operator: "WBTC", type: "AC",
    stops: ["Garia", "Naktala", "Tollygunge", "Rashbehari", "Hazra", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [11, 10, 12, 8, 11, 7, 6, 13], first: "06:15", last: "20:35", every: 40, reverseOffset: 20,
  },
  {
    number: "5", operator: "Private", type: "Non-AC",
    stops: ["Garia", "Jadavpur", "Dhakuria", "Gariahat", "Rashbehari", "Hazra", "Park Street", "Esplanade", "Howrah Station"],
    legs: [18, 8, 8, 8, 8, 10, 7, 19], first: "05:25", last: "21:25", every: 25, reverseOffset: 8,
  },
  {
    number: "S12", operator: "WBTC", type: "Non-AC",
    stops: ["New Town", "Salt Lake Sector V", "Karunamoyee", "Chingrighata", "Sealdah", "Moulali", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [15, 7, 13, 17, 7, 10, 7, 15], first: "05:45", last: "21:05", every: 25, reverseOffset: 12,
  },
  {
    number: "AC12", operator: "WBTC", type: "AC",
    stops: ["New Town", "Salt Lake Sector V", "Chingrighata", "Science City", "Park Circus", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [14, 13, 13, 11, 11, 7, 7, 15], first: "06:00", last: "20:30", every: 30, reverseOffset: 15,
  },
  {
    number: "S24", operator: "WBTC", type: "Non-AC",
    stops: ["Patuli", "Mukundapur", "Ruby", "Science City", "Park Circus", "Moulali", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [11, 8, 10, 11, 10, 9, 7, 15], first: "05:50", last: "21:10", every: 30, reverseOffset: 14,
  },
  {
    number: "45B", operator: "Private", type: "Non-AC",
    stops: ["Sealdah", "Moulali", "Park Circus", "Gariahat", "Jadavpur", "Baghajatin", "Garia", "Garia Station"],
    legs: [7, 12, 13, 14, 10, 9, 9], first: "05:40", last: "21:20", every: 25, reverseOffset: 9,
  },
  {
    number: "46", operator: "Private", type: "Non-AC",
    stops: ["Airport", "Baguiati", "Lake Town", "Ultadanga", "Sealdah", "Moulali", "Esplanade"],
    legs: [15, 12, 9, 15, 7, 11], first: "05:30", last: "21:30", every: 30, reverseOffset: 12,
  },
  {
    number: "S14", operator: "WBTC", type: "Non-AC",
    stops: ["Karunamoyee", "Salt Lake Sector V", "Chingrighata", "Science City", "Ruby", "Gariahat", "Jadavpur", "Baghajatin", "Garia"],
    legs: [10, 13, 12, 14, 15, 13, 10, 9], first: "06:00", last: "21:00", every: 30, reverseOffset: 11,
  },
  {
    number: "AC9", operator: "WBTC", type: "AC",
    stops: ["Jadavpur", "Gariahat", "Park Circus", "Science City", "Chingrighata", "Salt Lake Sector V", "Karunamoyee"],
    legs: [13, 14, 10, 11, 14, 7], first: "06:20", last: "20:20", every: 40, reverseOffset: 20,
  },
  {
    number: "S12D", operator: "WBTC", type: "Non-AC",
    stops: ["Thakurpukur", "Behala Chowrasta", "Taratala", "Mominpur", "Exide", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [13, 13, 12, 13, 6, 8, 7, 15], first: "05:45", last: "21:05", every: 30, reverseOffset: 14,
  },
  {
    number: "AC4", operator: "WBTC", type: "AC",
    stops: ["Parnashree", "Behala Chowrasta", "Taratala", "Mominpur", "Exide", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [12, 12, 13, 12, 7, 8, 7, 15], first: "06:10", last: "20:30", every: 40, reverseOffset: 18,
  },
  {
    number: "S21", operator: "WBTC", type: "Non-AC",
    stops: ["Bagbazar", "Shyambazar", "College Street", "Sealdah", "Esplanade", "Park Street", "Gariahat", "Jadavpur", "Garia"],
    legs: [9, 13, 9, 13, 8, 18, 14, 18], first: "05:40", last: "21:00", every: 35, reverseOffset: 15,
  },
  {
    number: "S30", operator: "WBTC", type: "Non-AC",
    stops: ["Ultadanga", "Salt Lake Sector V", "Karunamoyee", "New Town", "Eco Park"],
    legs: [20, 9, 14, 12], first: "06:00", last: "21:00", every: 30, reverseOffset: 15,
  },
  {
    number: "S6A", operator: "WBTC", type: "Non-AC",
    stops: ["Garia Station", "Garia", "Naktala", "Tollygunge", "Rashbehari", "Hazra", "Park Street", "Esplanade", "Howrah Station"],
    legs: [9, 11, 10, 12, 8, 11, 8, 20], first: "05:50", last: "21:10", every: 30, reverseOffset: 10,
  },
  {
    number: "S4", operator: "WBTC", type: "Non-AC",
    stops: ["Parnashree", "Behala Chowrasta", "Taratala", "Mominpur", "Exide", "Park Street", "Esplanade", "Sealdah", "Ultadanga", "Karunamoyee", "Salt Lake Sector V"],
    legs: [12, 11, 12, 13, 7, 8, 17, 15, 15, 9], first: "05:55", last: "20:55", every: 35, reverseOffset: 17,
  },
  {
    number: "AC1", operator: "WBTC", type: "AC",
    stops: ["Jadavpur", "Dhakuria", "Gariahat", "Rashbehari", "Hazra", "Park Street", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [8, 8, 8, 8, 10, 7, 7, 15], first: "06:10", last: "20:50", every: 40, reverseOffset: 18,
  },
  {
    number: "S12E", operator: "WBTC", type: "Non-AC",
    stops: ["Eco Park", "New Town", "Salt Lake Sector V", "Chingrighata", "Sealdah", "Moulali", "Esplanade", "B.B.D. Bagh", "Howrah Station"],
    legs: [12, 15, 12, 17, 7, 10, 7, 15], first: "06:05", last: "20:45", every: 40, reverseOffset: 20,
  },
  {
    number: "AC9B", operator: "WBTC", type: "AC",
    stops: ["Jadavpur", "Gariahat", "Park Circus", "Science City", "Chingrighata", "Salt Lake Sector V", "New Town", "Eco Park"],
    legs: [13, 14, 10, 11, 14, 16, 12], first: "06:30", last: "20:30", every: 45, reverseOffset: 20,
  },
];

export let STOPS = Array.from(new Set(routes.flatMap((route) => route.stops))).sort((a, b) => a.localeCompare(b));
export const STOP_ID_MAP = new Map<string, number>();

export function registerDatabaseStops(dbStops: { id: number; name: string }[]) {
  const set = new Set(STOPS);
  for (const s of dbStops) {
    set.add(s.name);
    STOP_ID_MAP.set(s.name.toLowerCase(), s.id);
  }
  STOPS = Array.from(set).sort((a, b) => a.localeCompare(b));
  SEARCH_INDEX = STOPS.map((name) => ({
    name,
    names: [name, ...(STOP_ALIASES[name] ?? [])].map(normalize),
  }));
}

export function getStopId(name: string): number | undefined {
  return STOP_ID_MAP.get(name.trim().toLowerCase());
}

export const POPULAR_JOURNEYS = [
  { from: "Esplanade", to: "Garia" },
  { from: "Howrah Station", to: "Salt Lake Sector V" },
  { from: "Garia", to: "Park Street" },
];

export function parseClock(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatClock(totalMinutes: number): { time: string; period: string } {
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return {
    time: `${String(hours % 12 || 12).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    period: hours < 12 ? "AM" : "PM",
  };
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} hr${remaining ? ` ${remaining} min` : ""}` : `${remaining} min`;
}

/** Extra names people actually type or say for a stop (English short forms and Bengali). */
const STOP_ALIASES: Record<string, string[]> = {
  "Howrah Station": ["howrah", "howrah stn", "howrah railway station", "হাওড়া"],
  "Salt Lake Sector V": ["salt lake", "saltlake", "sector 5", "sector v", "sector five", "সল্টলেক", "সেক্টর ফাইভ"],
  "B.B.D. Bagh": ["bbd bagh", "bbd", "dalhousie", "বিবাদী বাগ"],
  "New Town": ["newtown", "নিউ টাউন", "নিউটাউন"],
  Airport: ["dum dum airport", "netaji subhas airport", "ccu", "বিমানবন্দর", "এয়ারপোর্ট"],
  Esplanade: ["dharmatala", "এসপ্ল্যানেড", "ধর্মতলা"],
  Garia: ["গড়িয়া"],
  "Garia Station": ["garia stn", "গড়িয়া স্টেশন"],
  Gariahat: ["গড়িয়াহাট"],
  Jadavpur: ["যাদবপুর", "jadavpur university", "ju"],
  "Park Street": ["mullick bazar", "পার্ক স্ট্রিট"],
  Sealdah: ["sealdah station", "শিয়ালদহ", "শিয়ালদা"],
  Dhakuria: ["ঢাকুরিয়া"],
  Rashbehari: ["rash behari", "রাসবিহারী"],
  Tollygunge: ["tollygunj", "টালিগঞ্জ"],
  "Behala Chowrasta": ["behala", "বেহালা"],
  Bagbazar: ["bagbazaar", "বাগবাজার"],
  Shyambazar: ["shyam bazar", "syambazar", "শ্যামবাজার"],
  "College Street": ["college st", "কলেজ স্ট্রিট"],
  Baguiati: ["baguihati", "বাগুইআটি"],
  "Lake Town": ["laketown", "লেক টাউন"],
  Ultadanga: ["ultadanga", "উল্টোডাঙা"],
  Thakurpukur: ["ঠাকুরপুকুর"],
  Patuli: ["পাটুলি"],
  Mukundapur: ["মুকুন্দপুর"],
  "Science City": ["সায়েন্স সিটি"],
  "Park Circus": ["পার্ক সার্কাস"],
  Moulali: ["মৌলালি"],
  Karunamoyee: ["করুণাময়ী"],
  Chingrighata: ["চিংড়িঘাটা"],
  Hazra: ["হাজরা"],
  Baghajatin: ["bagha jatin", "বাঘাযতীন"],
  Naktala: ["নাকতলা"],
  "Eco Park": ["ecopark", "ইকো পার্ক"],
  Ruby: ["ruby hospital", "রুবি"],
  Exide: ["exide crossing"],
  Mominpur: ["momin pur"],
  Taratala: ["tara tala"],
  Parnashree: ["parnasree", "parnashree"],
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

const FUZZY_SCORE = 52;

function scoreName(query: string, candidate: string): number {
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80;
  const words = candidate.split(" ");
  if (words.some((word) => word.startsWith(query))) return 70;
  if (candidate.includes(query)) return 60;
  if (query.length >= 4) {
    const allowed = query.length >= 6 ? 2 : 1;
    if (editDistance(query, candidate, allowed) <= allowed) return FUZZY_SCORE;
    if (words.some((word) => editDistance(query, word, 1) <= 1)) return FUZZY_SCORE;
    if (editDistance(query, candidate.slice(0, query.length), 1) <= 1) return FUZZY_SCORE - 2;
  }
  return 0;
}

let SEARCH_INDEX = STOPS.map((name) => ({
  name,
  names: [name, ...(STOP_ALIASES[name] ?? [])].map(normalize),
}));

/** Typo-tolerant stop search that also understands short names and Bengali spellings. */
export function searchStops(input: string, limit = 7): { name: string; score: number }[] {
  const query = normalize(input);
  if (!query) return STOPS.slice(0, limit).map((name) => ({ name, score: 0 }));
  return SEARCH_INDEX.map((entry) => ({
    name: entry.name,
    score: Math.max(...entry.names.map((candidate) => scoreName(query, candidate))),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Exact names and aliases always resolve; a single clear one-typo match resolves too. */
export function resolveStop(input: string): string | undefined {
  const results = searchStops(input, 2);
  if (!results.length || normalize(input) === "") return undefined;
  const [best, next] = results;
  if (best.score === 100) return best.name;
  if (best.score === FUZZY_SCORE && (!next || next.score < FUZZY_SCORE)) return best.name;
  return undefined;
}

export interface TransferPlan {
  id: string;
  from: string;
  to: string;
  transferStop: string;
  first: BusTrip;
  second: BusTrip;
  /** minutes spent waiting at the change stop */
  wait: number;
  departure: number;
  arrival: number;
  duration: number;
}

const MIN_CHANGE_MINUTES = 4;

/** One-change journeys for pairs with no direct bus. Works on whatever routes are loaded. */
export function findTransferPlans(from: string, to: string, afterMinute: number, limit = 5): TransferPlan[] {
  if (from === to) return [];
  const plans: TransferPlan[] = [];
  for (const stop of STOPS) {
    if (stop === from || stop === to) continue;
    const legOne = findTrips(from, stop).filter((trip) => trip.departure >= afterMinute);
    if (!legOne.length) continue;
    const legTwo = findTrips(stop, to);
    if (!legTwo.length) continue;
    for (const first of legOne.slice(0, 12)) {
      const second = legTwo.find(
        (trip) => trip.departure >= first.arrival + MIN_CHANGE_MINUTES && trip.number !== first.number,
      );
      if (!second) continue;
      plans.push({
        id: `${first.id}>${second.id}`,
        from,
        to,
        transferStop: stop,
        first,
        second,
        wait: second.departure - first.arrival,
        departure: first.departure,
        arrival: second.arrival,
        duration: second.arrival - first.departure,
      });
      break;
    }
  }
  const seen = new Set<string>();
  return plans
    .sort((a, b) => a.arrival - b.arrival || a.duration - b.duration)
    .filter((plan) => {
      const key = `${plan.first.number}>${plan.second.number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function findTrips(from: string, to: string): BusTrip[] {
  if (from === to) return [];
  const results: BusTrip[] = [];

  for (const route of routes) {
    for (const reversed of [false, true]) {
      const stops = reversed ? [...route.stops].reverse() : route.stops;
      const legs = reversed ? [...route.legs].reverse() : route.legs;
      const boardingIndex = stops.indexOf(from);
      const alightingIndex = stops.indexOf(to);
      if (boardingIndex < 0 || alightingIndex <= boardingIndex) continue;

      const cumulative = [0];
      for (const leg of legs) cumulative.push(cumulative[cumulative.length - 1] + leg);

      const first = parseClock(route.first) + (reversed ? route.reverseOffset ?? 10 : 0);
      const last = parseClock(route.last) + (reversed ? route.reverseOffset ?? 10 : 0);
      for (let start = first; start <= last; start += route.every) {
        const departure = start + cumulative[boardingIndex];
        const arrival = start + cumulative[alightingIndex];
        if (departure >= 1440) continue;
        results.push({
          id: `${route.number}-${reversed ? "return" : "outbound"}-${start}`,
          number: route.number,
          operator: route.operator,
          type: route.type,
          terminusFrom: stops[0],
          terminusTo: stops[stops.length - 1],
          boarding: from,
          alighting: to,
          departure,
          arrival,
          duration: arrival - departure,
          via: stops.slice(boardingIndex + 1, alightingIndex),
          journeyStops: stops.slice(boardingIndex, alightingIndex + 1).map((name, index) => ({
            name,
            minutes: start + cumulative[boardingIndex + index],
            role: index === 0 ? "boarding" : index === alightingIndex - boardingIndex ? "alighting" : "intermediate",
          })),
          fullStops: stops.map((name, index) => ({
            name,
            minutes: start + cumulative[index],
            journey: index >= boardingIndex && index <= alightingIndex,
          })),
          headway: route.every,
          serviceStart: first,
          serviceEnd: last,
        });
      }
    }
  }

  return results.sort((a, b) => a.departure - b.departure || a.number.localeCompare(b.number));
}

/** Look a saved bus back up from a previously viewed journey. */
export function findTrip(from: string, to: string, tripId: string): BusTrip | undefined {
  return findTrips(from, to).find((trip) => trip.id === tripId);
}
