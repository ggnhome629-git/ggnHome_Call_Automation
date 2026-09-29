# GGN Home Call Automation

## Overview

**GGN Home Call Automation** is an intelligent voice-to-property-matching system that automates rental property recommendations through voice calls. It monitors Google Drive for incoming audio files, transcribes them using multiple Speech-to-Text (STT) providers, extracts rental property requirements from transcripts, queries a MongoDB database for matching properties, and delivers personalized recommendations via email.

The system is designed to streamline the property rental inquiry process by converting voice calls into actionable property matches in real-time.

---

## Key Features

- **🎙️ Multi-Provider Speech-to-Text**: Automatic fallback between Whisper, Vosk (offline), Deepgram, and AssemblyAI
- **👀 Google Drive Monitoring**: Continuous polling of Google Drive for new audio files
- **🧠 Intelligent Keyword Extraction**: Extracts BHK (bedrooms), Sector, Budget from transcripts
- **🔄 Self-Learning Normalization**: Learns from transcript errors and applies learned corrections
- **📱 Mobile Number Extraction**: Automatically extracts caller phone numbers from filenames
- **🏠 Smart Property Matching**: Multi-level search (3-field, 2-field, 1-field matches)
- **📧 Email Notifications**: Sends recommendations via Brevo SMTP service
- **⏳ Pending Recommendations**: Stores recommendations for unregistered callers; sends when they sign up
- **💾 State Management**: Tracks processed files to avoid duplicates
- **🔐 Secure Authentication**: JWT-based auth with refresh tokens
- **⚡ Render/Vercel Optimized**: Platform-aware transcription provider selection

---

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: MongoDB (Mongoose ODM)
- **API Client**: Axios

### Speech-to-Text Providers
- **Whisper**: OpenAI's speech recognition (primary when RAM available)
- **Vosk**: Offline, lightweight speech recognition (fallback)
- **Deepgram**: Cloud-based STT with round-robin load balancing
- **AssemblyAI**: Advanced STT with polling

### Authentication & Security
- **JWT**: Token-based authentication (access + refresh tokens)
- **bcryptjs**: Password hashing

### External Services
- **Google Drive API**: File monitoring and downloading
- **Brevo SMTP**: Email delivery
- **node-cron**: Scheduled tasks

### Development
- **dotenv**: Environment variable management
- **googleapis**: Google APIs client library

---

## Project Structure

```
ggnHome_Call_Automation/
├── server.js                 # Express server entry point
├── package.json              # Dependencies and scripts
├── package-lock.json         # Locked dependency versions
├── .gitignore                # Git ignore rules
│
├── src/
│   ├── driveWatcher.js      # Polls Google Drive every 30s for new files
│   ├── drive.js             # Google Drive API wrapper
│   ├── transcriber.js       # Multi-provider STT orchestration
│   ├── processor.js         # Main audio processing pipeline
│   ├── db.js                # MongoDB schemas and database logic
│   ├── mailer.js            # Email sending utilities
│   ├── transcribe_vosk.py   # Vosk transcription Python script
│   └── transcribe_whisper.py # Whisper transcription Python script
│
├── auth/
│   └── get-token.js         # Google OAuth token generation script
│
├── data/
│   ├── drive_state.json     # Tracks last processed file timestamp
│   └── audio/               # Temporary audio files (auto-cleaned)
│
└── test files/
    ├── test.json            # Test data
    ├── test.txt             # Sample transcript
    ├── test.srt             # SRT subtitle format
    ├── test.vtt             # WebVTT subtitle format
    └── test.tsv             # Tab-separated values
```

---

## Installation

### Prerequisites
- **Node.js** >= 18.0.0
- **Python** >= 3.9 (for Vosk and Whisper support)
- **FFmpeg** (for audio format conversion)
- **MongoDB** instance (local or cloud)
- **Google Cloud Project** with Drive API enabled
- **API Keys** for STT providers (Deepgram, AssemblyAI) and Brevo

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/ggnhome629-git/ggnHome_Call_Automation.git
   cd ggnHome_Call_Automation
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Set up Python environment** (optional, for offline STT)
   ```bash
   python3 -m venv pyenv
   source pyenv/bin/activate  # On Windows: pyenv\Scripts\activate
   pip install openai-whisper vosk pydub scipy
   ```

4. **Create `.env` file**
   ```bash
   cp .env.example .env  # If available, or create manually
   ```

5. **Configure environment variables** (see Configuration section)

6. **Verify MongoDB connection**
   ```bash
   npm start
   ```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname

# Google Drive
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id

# STT Providers
DEEPGRAM_API_KEY=your_deepgram_key
ASSEMBLYAI_API_KEY=your_assemblyai_key

# Email Service
BREVO_API_KEY=your_brevo_api_key

# JWT Secrets
ACCESS_TOKEN_SECRET=your_secret_key
ACCESS_TOKEN_SECRET_EXPIRE=7d
REFRESH_TOKEN_SECRET=your_refresh_secret
REFRESH_TOKEN_SECRET_EXPIRE=30d

# Platform Detection (auto-set)
RENDER=true        # Set by Render.com
VERCEL=false       # Set by Vercel
```

### Setting Up Google Drive Authorization

1. Run the token generation script:
   ```bash
   node auth/get-token.js
   ```

2. Follow the URL prompt in your browser

3. Authorize and copy the code

4. Paste the code back into the terminal

5. Copy `GOOGLE_REFRESH_TOKEN` from the output to `.env`

### Audio File Format

The system monitors Google Drive for audio files with these extensions:
- `.mp3`
- `.wav`
- `.m4a`
- `.aac`
- `.amr`

**Filename Convention** (for mobile number extraction):
```
call_recording__9876543210.mp3
                  ^^^^^^^^^^
                  Mobile number (last 10 digits)
```

---

## Usage

### Starting the Server

```bash
npm start
```

The server will:
1. Connect to MongoDB
2. Start listening on `http://0.0.0.0:3000`
3. Begin monitoring Google Drive every 30 seconds
4. Process new audio files automatically

### Health Check
```bash
curl http://localhost:3000/
# Response: "GGN Home Call Automation is running"
```

### Processing Pipeline

1. **File Detection** (driveWatcher.js)
   - Polls Google Drive every 30 seconds
   - Identifies audio files
   - Extracts mobile number from filename

2. **Download** (drive.js)
   - Downloads file to `/data/audio/`

3. **Transcription** (transcriber.js)
   - Tries Whisper (if sufficient RAM & not Render/Vercel)
   - Falls back to Vosk (offline)
   - Last resort: Deepgram or AssemblyAI (round-robin)

4. **Keyword Extraction** (processor.js)
   - Extracts: BHK, Sector, Budget
   - Applies learned normalization rules
   - Normalizes currency (₹k, lakh, crore)

5. **Database Search** (db.js)
   - Searches MongoDB for matching properties
   - Priority: 3-field > 2-field > 1-field matches
   - Returns up to 3 results

6. **Email Delivery** (mailer.js)
   - Sends recommendations via Brevo
   - If caller is registered: sends immediately
   - If unregistered: stores pending recommendations
   - Sends when caller later signs up

### Manual Testing

```bash
# Test transcript extraction
node -e "const {extractKeywords} = require('./src/transcriber'); console.log(extractKeywords('I am looking for a 2 bhk in sector 62 with rent 15000'))"

# Test database search
node -e "const {searchRentalProperties} = require('./src/db'); searchRentalProperties({bhk: 2, sector: 62, maxPrice: 15000}).then(r => console.log(r))"
```

---

## API Endpoints

Currently, the system runs in **background daemon mode**. The only exposed endpoint is:

### Health Check
```http
GET /
Response: 200 OK
Body: "GGN Home Call Automation is running"
```

---

## Dependencies

### Production Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| axios | ^1.13.2 | HTTP client for API calls |
| bcryptjs | ^3.0.3 | Password hashing |
| dotenv | ^17.2.3 | Environment variable management |
| express | ^5.2.1 | Web framework |
| googleapis | ^170.0.0 | Google APIs client |
| jsonwebtoken | ^9.0.3 | JWT token generation |
| mongoose | ^8.21.0 | MongoDB ODM |
| node-cron | ^4.2.1 | Task scheduling |

### Python Dependencies (Optional)
- `openai-whisper` - Speech-to-text
- `vosk` - Offline speech recognition
- `pydub` - Audio processing
- `scipy` - Scientific computing

---

## Error Handling & Troubleshooting

### Common Issues

#### 1. **MongoDB Connection Failed**
```
Error: MongoDB connection failed: connection refused
```
**Solution**: Ensure MongoDB is running and `MONGO_URI` is correct
```bash
mongosh "mongodb+srv://user:password@cluster.mongodb.net/dbname"
```

#### 2. **Google Drive API Error**
```
Error: Unauthorized - Invalid refresh token
```
**Solution**: Regenerate token using `auth/get-token.js`

#### 3. **Transcription Timeout**
```
Error: All transcription methods failed
```
**Solutions**:
- Check API keys for Deepgram/AssemblyAI
- Verify audio file format (convert with FFmpeg if needed)
- Check available RAM on server

#### 4. **Low RAM Warning**
```
Warning: Low RAM detected — skipping Whisper to avoid crash
```
**Solution**: Increase server memory or use cloud providers (Deepgram/AssemblyAI)

#### 5. **File Too Large for Render**
```
Error: File too large for Render free tier
```
**Solution**: Compress audio files to < 6MB before uploading

#### 6. **Brevo Email Delivery Failed**
```
Error: Failed to send email
```
**Solutions**:
- Verify `BREVO_API_KEY` is correct
- Check recipient email validity
- Ensure sender domain is verified in Brevo

### Logging

Logs include:
- ✅ Success indicators (green)
- ⚠️ Warnings (yellow)
- ❌ Errors (red)
- 👀 File detection events
- 🎙️ Transcription progress
- 🧠 Keyword extraction results
- 📧 Email delivery status

---

## Performance Considerations

### Platform Optimization

**Render Free Tier:**
- Max file size: 6 MB
- Max audio duration: 25 seconds
- Skips Whisper (insufficient RAM)
- Uses Deepgram/AssemblyAI (round-robin)

**Vercel (if used):**
- Max file size: 8 MB
- Skips Vosk (serverless incompatibility)
- Uses Deepgram/AssemblyAI

**Local/Self-Hosted:**
- No file size limits
- Uses Whisper (best quality)
- Falls back to Vosk (offline)

### Database Indexing

Recommended MongoDB indexes for performance:
```javascript
// src/db.js - add to RentalpropertySchema
bedrooms: { type: Number, index: true },
Sector: { type: String, index: true },
monthlyRent: { type: Number, index: true },
isActive: { type: Boolean, index: true }
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request with description

### Code Style
- Use consistent indentation (2 spaces)
- Add comments for complex logic
- Follow async/await patterns
- Handle errors gracefully

### Testing
- Test with real audio files
- Verify all STT providers work
- Check email delivery
- Validate MongoDB queries

---

## Deployment

### Deploy to Render

1. **Connect repository** to Render.com
2. **Set environment variables** in Render dashboard
3. **Add build command**:
   ```bash
   npm install
   ```
4. **Add start command**:
   ```bash
   npm start
   ```
5. **Deploy** and monitor logs

### Deploy to Heroku

```bash
# Install Heroku CLI
heroku create your-app-name

# Set environment variables
heroku config:set MONGO_URI=... GOOGLE_CLIENT_ID=... etc.

# Deploy
git push heroku main
```

### Deploy to AWS/GCP/Azure

Use containerization:
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Security

### Best Practices

1. **Environment Variables**: Never commit `.env` to Git
2. **API Keys**: Rotate keys regularly
3. **Database**: Use MongoDB Atlas with IP whitelisting
4. **OAuth**: Store refresh tokens securely
5. **Passwords**: Hash with bcryptjs (10 salt rounds)
6. **CORS**: Configure if exposing API endpoints
7. **Rate Limiting**: Add to prevent abuse
8. **Input Validation**: Sanitize file inputs

### Sensitive Data Handling

- Audio files are deleted after processing
- Mobile numbers are extracted but not logged
- Transcripts are not stored permanently
- Recommendations auto-delete after 24 hours

---

## License

This project is licensed under the **ISC License**. See `package.json` for details.

---

## Support & Contact

- **GitHub Issues**: [Report bugs here](https://github.com/ggnhome629-git/ggnHome_Call_Automation/issues)
- **Email**: support@ggnhome.com
- **Website**: https://ggnhome.com

---

## Changelog

### Version 1.0.0 (Current)
- ✅ Google Drive monitoring
- ✅ Multi-provider STT with fallbacks
- ✅ Keyword extraction & normalization
- ✅ Property matching & ranking
- ✅ Email notifications via Brevo
- ✅ Pending recommendations for unregistered users
- ✅ Self-learning normalization rules
- ✅ Render/Vercel platform optimization

---

## Roadmap

- [ ] WhatsApp integration for direct messaging
- [ ] SMS notifications for property matches
- [ ] Admin dashboard for monitoring
- [ ] Advanced NLP for better keyword extraction
- [ ] Multi-language support
- [ ] Call recording integration
- [ ] Payment gateway integration
- [ ] Automated property posting

---

## Acknowledgments

- OpenAI Whisper for speech recognition
- Google Drive API for file management
- MongoDB for data persistence
- Brevo for email delivery
- Community for feedback and contributions

---

**Last Updated**: September 2026
**Status**: Production Ready
**Maintainer**: ggnHome Team
