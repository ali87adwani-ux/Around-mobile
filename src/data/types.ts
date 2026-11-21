export type Lang = 'ar' | 'en';
export type L10n = { ar: string; en: string };

export type Amenity = 'parking' | 'showers' | 'lights' | 'cafe' | 'changing' | 'balls' | 'wifi' | 'ac';
export type Governorate = 'capital' | 'hawalli' | 'farwaniya' | 'ahmadi' | 'jahra' | 'mubarak_alkabeer';

export interface Review {
  id: string;
  pitchId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  at: number;
}
export type PitchSize = 5 | 6 | 7 | 11;
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Pitch {
  id: string;
  ownerId?: string;
  active?: boolean;
  /** Listings added by owners stay 'pending' until an admin approves them. */
  status?: 'pending' | 'approved' | 'rejected';
  /** Public photo URLs (first one is the cover) and their storage paths. */
  photos?: string[];
  photoPaths?: string[];
  nameEn?: string;
  /** Identical courts at this venue (a booking takes any free one). */
  courts?: number;
  governorate: Governorate;
  lat?: number;
  lng?: number;
  name: L10n;
  area: L10n;
  address: L10n;
  pricePerHour: number;
  sizes: PitchSize[];
  surface: 'artificial' | 'natural';
  indoor: boolean;
  rating: number;
  reviews: number;
  distanceKm: number;
  amenities: Amenity[];
  openFrom: number;
  openTo: number;
  tint: [string, string];
}

export interface Player {
  id: string;
  name: L10n;
  position: Position;
  level: Level;
  area: L10n;
  stats: { matches: number; goals: number; assists: number; mvp: number; wins: number; rating: number };
  color: string;
  avatarUrl?: string;
}

export interface Match {
  id: string;
  pitchId: string;
  dayOffset: number;
  hour: number;
  duration: number;
  format: PitchSize;
  level: Level;
  pricePerPlayer: number;
  maxPlayers: number;
  playerIds: string[];
  organizerId: string;
  createdByMe?: boolean;
}

export interface TeamRow {
  id: string;
  name: L10n;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  color: string;
  captainId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  paid?: boolean;
  groupLabel?: string;
}

export interface Fixture {
  id: string;
  /** Empty until the team is known (later knockout rounds). */
  homeId?: string;
  awayId?: string;
  /** Kick-off; empty until the schedule is generated. */
  startsAt?: string;
  dayOffset: number;
  hour: number;
  score?: [number, number];
  pens?: [number, number];
  stage?: 'league' | 'group' | 'knockout';
  roundNo?: number;
  groupLabel?: string;
  bracketPos?: number;
  status?: 'scheduled' | 'played' | 'walkover' | 'bye';
  mvpId?: string;
}

export type TournamentStatus = 'pending' | 'open' | 'closed' | 'live' | 'finished' | 'rejected' | 'cancelled';
export type TournamentFormat = 'league' | 'knockout' | 'groups';

export interface Tournament {
  id: string;
  name: L10n;
  pitchId: string;
  format: PitchSize;
  status: TournamentStatus;
  startOffset: number;
  startsOn?: string;
  organizerId?: string;
  formatType?: TournamentFormat;
  groupsCount?: number;
  minPlayers?: number;
  maxPlayers?: number;
  ageCategory?: string;
  prizeSecond?: number;
  rules?: string;
  commissionRate?: number;
  rejectReason?: string;
  finishedAt?: string;
  regDeadline?: string;
  slotMinutes?: number;
  maxTeams: number;
  entryFee: number;
  prize: number;
  teams: TeamRow[];
  fixtures: Fixture[];
  tint: [string, string];
}

export interface Booking {
  id: string;
  pitchId: string;
  dateISO: string;
  hour: number;
  duration: number;
  size: PitchSize;
  total: number;
  status: 'confirmed' | 'cancelled';
  createdAt: number;
}

export interface Profile {
  id: 'me';
  name: string;
  position: Position;
  level: Level;
  phone: string;
  avatarUrl?: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: L10n;
  body: L10n;
  data: Record<string, string>;
  read: boolean;
  at: number;
}

export interface PitchSubmissionInput {
  name: string;
  area: string;
  governorate: Governorate;
  address: string;
  price: number;
  sizes: PitchSize[];
  surface: 'artificial' | 'natural';
  indoor: boolean;
  amenities: Amenity[];
  openFrom: number;
  openTo: number;
  phone: string;
  note: string;
  lat?: number;
  lng?: number;
}

export interface PendingPitch {
  pitchId: string;
  ownerId: string;
  ownerName: string;
  phone: string;
  note: string;
  at: number;
}

export interface RosterPlayer {
  teamId: string;
  userId: string;
  name: string;
  avatarUrl?: string;
}

export interface MatchEvent {
  id: string;
  fixtureId: string;
  teamId: string;
  playerId?: string;
  kind: 'goal' | 'own_goal' | 'yellow' | 'red';
  minute?: number;
}

export interface Highlight {
  id: string;
  fixtureId: string;
  playerId?: string;
  url: string;
  path: string;
  likes: number;
  at: number;
}

export interface TournamentAward {
  kind: 'champion' | 'runner_up' | 'top_scorer' | 'best_player' | 'best_keeper';
  teamId?: string;
  userId?: string;
  value?: number;
}

export interface DuesRow {
  tournamentId: string;
  name: L10n;
  organizerId: string;
  organizerName: string;
  status: TournamentStatus;
  entryFee: number;
  paidTeams: number;
  rate: number;
  amount: number;
  settled: boolean;
  finishedAt?: string;
}

export interface Trophy {
  tournamentId: string;
  name: L10n;
  kind: TournamentAward['kind'];
  value?: number;
}
