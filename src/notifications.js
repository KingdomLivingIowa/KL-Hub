import { supabase } from './supabaseClient';

// Notification types
export const NOTIF_TYPES = {
  CLIENT_STATUS_CHANGE: 'client_status_change',
  CLIENT_POSITIVE_UA: 'client_positive_ua',
  CLIENT_CRISIS: 'client_crisis',
  CLIENT_LEVEL_CHANGE: 'client_level_change',
  CLIENT_WEEKLY_CHECKIN: 'client_weekly_checkin',
};

// Default preferences — all on
export const DEFAULT_PREFERENCES = {
  [NOTIF_TYPES.CLIENT_STATUS_CHANGE]: true,
  [NOTIF_TYPES.CLIENT_POSITIVE_UA]: true,
  [NOTIF_TYPES.CLIENT_CRISIS]: true,
  [NOTIF_TYPES.CLIENT_LEVEL_CHANGE]: true,
  [NOTIF_TYPES.CLIENT_WEEKLY_CHECKIN]: true,
};

export const NOTIF_LABELS = {
  [NOTIF_TYPES.CLIENT_STATUS_CHANGE]: 'Client status changes',
  [NOTIF_TYPES.CLIENT_POSITIVE_UA]: 'Positive UA logged',
  [NOTIF_TYPES.CLIENT_CRISIS]: 'Crisis entry logged',
  [NOTIF_TYPES.CLIENT_LEVEL_CHANGE]: 'Client level changes',
  [NOTIF_TYPES.CLIENT_WEEKLY_CHECKIN]: 'Weekly check-in submitted (portal)',
};

// Get house managers assigned to a given house, filtered by their preferences
export async function getHouseManagersForHouse(houseId, notifType) {
  if (!houseId) return [];

  // Get all house managers assigned to this house
  const { data: assignments } = await supabase
    .from('user_house_assignments')
    .select('user_id')
    .eq('house_id', houseId);

  if (!assignments?.length) return [];

  const userIds = assignments.map(a => a.user_id);

  // Get their profiles and check notification preferences
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, notification_preferences, role')
    .in('id', userIds)
    .in('role', ['house_manager', 'head_house_manager']);

  if (!profiles?.length) return [];

  // Filter by preference — null means all on (default)
  return profiles.filter(p => {
    const prefs = p.notification_preferences;
    if (!prefs) return true; // null = all on
    if (typeof prefs[notifType] === 'boolean') return prefs[notifType];
    return true; // missing key = on
  }).map(p => p.id);
}

// Send notification to relevant house managers
export async function sendHouseNotification({ houseId, type, message, clientId }) {
  try {
    const userIds = await getHouseManagersForHouse(houseId, type);
    if (!userIds.length) return;

    const rows = userIds.map(userId => ({
      user_id: userId,
      type,
      message,
      client_id: clientId || null,
      house_id: houseId || null,
      read: false,
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('Notification insert error:', error);
  } catch (err) {
    console.error('sendHouseNotification error:', err);
  }
}