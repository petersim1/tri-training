export type StravaTokenPayload = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds */
  expiresAt: number;
  athleteId: number | null;
};
