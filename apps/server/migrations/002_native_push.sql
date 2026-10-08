-- Native uygulamalar: APNs (iOS) ve FCM (Android) jetonları; Expo jetonları geriye dönük desteklenir.
ALTER TABLE users ADD COLUMN push_provider text CHECK (push_provider IN ('apns', 'fcm', 'expo'));
UPDATE users SET push_provider = 'expo' WHERE push_token IS NOT NULL;
