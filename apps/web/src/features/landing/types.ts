export interface PublicItem {
  id: string;
  slug: string;
  name: string;
  description?: string;
  bio?: string;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  specialties?: string[];
  equipment?: string[];
  capacity?: number;
  durationMinutes?: number;
  category?: string;
  level?: string;
}
export interface Club {
  name: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  legalName: string;
  bookingPolicy: {
    bookingOpenDays: number;
    bookingCloseMinutes: number;
    cancelMinutes: number;
    waitlistCutoffMinutes: number;
  };
}
