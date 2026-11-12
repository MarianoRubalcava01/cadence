// Shared types for Strava Plus (real multi-user app, Supabase backend)

export type Privacy = 'public' | 'followers' | 'only_me'
export type Unit = 'km' | 'mi'

export interface Profile {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
}

export interface Activity {
  id: string
  user_id: string
  sport: string
  title: string
  description: string | null
  distance_m: number
  moving_time_s: number
  elapsed_time_s: number
  elevation_gain_m: number
  calories: number
  avg_hr: number | null
  max_hr: number | null
  effort: number | null
  location: string | null
  notes: string | null
  privacy: Privacy
  gear_id: string | null
  started_at: string
  created_at: string
  route_geojson: { type: 'LineString'; coordinates: [number, number][] } | null
  photo_urls: string[] | null
  profiles?: Profile | null
  kudos_count?: number
  comments_count?: number
}

export interface ActivityPoint {
  id?: string
  activity_id: string
  lat: number
  lng: number
  elevation: number | null
  recorded_at: string
  seq: number
}

export interface Kudos {
  id: string
  activity_id: string
  user_id: string
  created_at: string
}

export interface ActivityComment {
  id: string
  activity_id: string
  user_id: string
  body: string
  created_at: string
  profiles?: Profile | null
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

export interface Club {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
  member_count?: number
}

export interface ClubMember {
  id: string
  club_id: string
  user_id: string
  role: string
  created_at: string
  profiles?: Profile | null
}

export interface Segment {
  id: string
  name: string
  sport: string
  start_lat: number
  start_lng: number
  end_lat: number
  end_lng: number
  distance_m: number
  created_by: string
  created_at: string
  effort_count?: number
}

export interface SegmentEffort {
  id: string
  segment_id: string
  activity_id: string
  user_id: string
  elapsed_s: number
  created_at: string
  profiles?: Profile | null
}

export interface Challenge {
  id: string
  title: string
  description: string | null
  sport: string
  metric: 'distance' | 'elevation' | 'activities' | 'time'
  target: number
  unit: string
  start_date: string
  end_date: string
  created_by: string
  created_at: string
  joined?: boolean
}

export interface ChallengeEntry {
  id: string
  challenge_id: string
  user_id: string
  progress: number
  created_at: string
  profiles?: Profile | null
}

export interface Goal {
  id: string
  user_id: string
  metric: 'distance' | 'time' | 'activities' | 'elevation'
  target: number
  unit: string
  period: 'week' | 'month'
  created_at: string
}

export interface GearItem {
  id: string
  user_id: string
  name: string
  type: string
  brand: string | null
  model: string | null
  distance_m: number
  retire_at_m: number | null
  created_at: string
}

export interface SavedRoute {
  id: string
  user_id: string
  name: string
  sport: string
  distance_m: number
  elevation_gain_m: number
  is_public: boolean
  route_geojson: { type: 'LineString'; coordinates: [number, number][] }
  created_at: string
}

export interface TrainingPlan {
  id: string
  user_id: string
  name: string
  goal_event: string | null
  start_date: string
  end_date: string
  weeks: { week: number; target_distance_m: number; workouts: string[] }[]
  created_at: string
}

export interface BeaconSession {
  id: string
  user_id: string
  activity_id: string | null
  token: string
  is_live: boolean
  started_at: string
  ended_at: string | null
  profiles?: Profile | null
}

export interface BeaconPoint {
  id: string
  session_id: string
  lat: number
  lng: number
  recorded_at: string
}

export const SPORTS: string[] = [
  'Run', 'Trail Run', 'Virtual Run', 'Ride', 'Mountain Bike', 'Gravel Ride',
  'E-Bike Ride', 'E-Mountain Bike Ride', 'Virtual Ride', 'Walk', 'Hike',
  'Swim', 'Workout', 'Weight Training', 'Crossfit', 'Yoga', 'Pilates',
  'Elliptical', 'Stair Stepper', 'Rowing', 'Kayaking', 'Canoeing',
  'Stand Up Paddling', 'Surfing', 'Ski', 'Snowboard', 'Ice Skate',
  'Roller Ski', 'Rock Climbing', 'Soccer', 'Basketball', 'Tennis', 'Golf',
  'Dance', 'Martial Arts', 'Boxing',
]

export const SPORT_MET: Record<string, number> = {
  Run: 9.8, 'Trail Run': 10.5, 'Virtual Run': 9.8, Ride: 8.0,
  'Mountain Bike': 8.5, 'Gravel Ride': 8.0, 'E-Bike Ride': 5.5,
  'E-Mountain Bike Ride': 6.0, 'Virtual Ride': 8.0, Walk: 3.5, Hike: 6.0,
  Swim: 8.0, Workout: 6.0, 'Weight Training': 5.0, Crossfit: 9.0,
  Yoga: 3.0, Pilates: 3.5, Elliptical: 6.5, 'Stair Stepper': 7.0,
  Rowing: 7.5, Kayaking: 5.0, Canoeing: 4.5, 'Stand Up Paddling': 5.5,
  Surfing: 5.0, Ski: 7.5, Snowboard: 6.0, 'Ice Skate': 6.5, 'Roller Ski': 8.0,
  'Rock Climbing': 7.0, Soccer: 8.5, Basketball: 7.5, Tennis: 7.0,
  Golf: 4.5, Dance: 5.0, 'Martial Arts': 8.0, Boxing: 9.0,
}

export function isRunSport(sport: string): boolean {
  return sport.toLowerCase().includes('run') || sport === 'Walk' || sport === 'Hike'
}

export function isRideSport(sport: string): boolean {
  return sport.toLowerCase().includes('ride') || sport.toLowerCase().includes('bike')
}
