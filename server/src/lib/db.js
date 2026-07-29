/**
 * MongoDB connection. One place, so the entrypoint and the smoke test share it.
 */
import mongoose from 'mongoose';

import { Issue } from '../models/Issue.js';
import { Report } from '../models/Report.js';
import { GemmaCall } from '../models/GemmaCall.js';
import { Citizen } from '../models/Citizen.js';
import { AdminUser } from '../models/AdminUser.js';
import { OtpChallenge } from '../models/OtpChallenge.js';
import { AdminInvite } from '../models/AdminInvite.js';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  // $geoNear fails if the 2dsphere index isn't built yet, so wait for indexes
  // before the first request can land. The auth models are here for the same
  // reason: the unique constraints on phone/email are what stop a race between
  // two simultaneous first-time logins creating two accounts for one person.
  await Promise.all([
    Issue.init(),
    Report.init(),
    GemmaCall.init(),
    Citizen.init(),
    AdminUser.init(),
    OtpChallenge.init(),
    AdminInvite.init(),
  ]);

  return mongoose.connection;
}

/** 0 disconnected · 1 connected · 2 connecting · 3 disconnecting */
export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}
