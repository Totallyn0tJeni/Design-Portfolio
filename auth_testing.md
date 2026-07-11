# Auth Testing Playbook (Emergent Google OAuth + Admin Allowlist)

## Setup Test User & Session (bypass Google for backend/frontend tests)
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'jeni.1245690@gmail.com',
  name: 'Jenisha Patel (Test)',
  picture: 'https://via.placeholder.com/150',
  is_admin: true,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Test backend
```bash
curl -X GET "$REACT_APP_BACKEND_URL/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
curl -X GET "$REACT_APP_BACKEND_URL/api/admin/stats" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Browser Testing
```python
await page.context.add_cookies([{
    "name": "session_token", "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app.com", "path": "/",
    "httpOnly": True, "secure": True, "sameSite": "None"
}])
```

## Admin Allowlist
- Configured via `ADMIN_EMAILS` env var (comma-separated)
- Runtime updates via `/api/admin/allowlist` endpoints
- Emails: jeni.1245690@gmail.com, totallyn0tjenisha@gmail.com
