const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* ================================
   USER SCHEMA
================================ */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    passwordSet: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["renter", "owner", "admin", "Agent"],
      default: "renter",
    },
    accessToken: {
      type: String,
    },
    refreshToken: {
      type: String,
    },
    Rewards: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  this.passwordSet = true;
  next();
});

// 🔑 Generate Access Token
userSchema.methods.getAccessToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_SECRET_EXPIRE }
  );
};

// 🔑 Generate Refresh Token
userSchema.methods.getRefreshToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_SECRET_EXPIRE }
  );
};

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

/* ================================
   DB CONNECTION
================================ */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

/* ================================
   RENTAL PROPERTY SCHEMA
================================ */
// Model For renting the Property
const RentalpropertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    address: { type: String },

    // IMPORTANT: stored as STRING (e.g. "62")
    Sector: { type: String, required: true },

    propertyType: {
      type: String,
      enum: ["house", "apartment", "condo", "townhouse", "villa"],
    },

    purpose: { type: String },

    bedrooms: { type: Number },
    bathrooms: { type: Number },

    totalArea: {
      sqft: { type: Number },
      configuration: { type: String }, // "2 BHK"
    },

    totalFloors: { type: Number, min: 0 },
    floorForRent: { type: Number, min: 0 },

    layoutFeatures: { type: String },
    appliances: [{ type: String }],
    conditionAge: { type: String },
    renovations: { type: String },
    parking: { type: String },
    outdoorSpace: { type: String },

    // Financials
    monthlyRent: { type: Number, required: true },
    leaseTerm: { type: String },
    securityDeposit: { type: String },
    otherFees: { type: String },
    utilities: [{ type: String }],
    tenantRequirements: { type: String },
    moveInDate: { type: Date },

    // Location & Amenities
    neighborhoodVibe: { type: String },
    transportation: { type: String },
    localAmenities: { type: String },
    communityFeatures: [{ type: String }],

    // Policies
    petPolicy: { type: String },
    smokingPolicy: { type: String },
    maintenance: { type: String },
    insurance: { type: String },

    // Media
    images: [{ type: String }],
    panoramas: [
      {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        url: { type: String, required: true, trim: true },
        yaw: { type: Number, default: 0 },
        pitch: { type: Number, default: 0 },
        notes: { type: String, trim: true, maxlength: 500 },
      },
    ],

    defaultpropertytype: {
      type: String,
      default: "rental",
      immutable: true,
    },

    cloudinaryAccountIndex: { type: Number, default: null },
    cloudinaryFolder: { type: String },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ownernumber: { type: String },
    ownerType: {
      type: String,
      enum: ["Owner", "Agent", "Admin"],
      default: "Owner",
    },

    isActive: { type: Boolean, default: false },
    isPostedNew: { type: Boolean, default: true },
    isEdited: { type: Boolean, default: false },

    agentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.ownerType === "Agent" || this.ownerType === "Admin";
      },
      index: true,
    },
  },
  { timestamps: true }
);

const RentalProperty = mongoose.model(
  "RentalProperty",
  RentalpropertySchema
);

const PendingRecommendationSchema = new mongoose.Schema(
  {
    mobileNumber: { type: String, index: true },
    propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "RentalProperty" }],
    createdAt: { type: Date, default: Date.now, expires: 86400 } // auto-delete after 24h
  },
  { timestamps: true }
);

const PendingRecommendation = mongoose.model(
  "PendingRecommendation",
  PendingRecommendationSchema
);

/* ================================
   CONTROLLER / SERVICE FUNCTION
================================ */
async function searchRentalProperties(normalized) {
  const baseQuery = {
    defaultpropertytype: "rental",
    isActive: true,
  };

  const results = [];

  // 1️⃣ Highest priority: all 3 fields match
  if (normalized.bhk !== null && normalized.sector !== null && normalized.maxPrice !== null) {
    const threeMatch = await RentalProperty.find({
      ...baseQuery,
      bedrooms: normalized.bhk,
      Sector: normalized.sector.toString(),
      monthlyRent: { $lte: normalized.maxPrice },
    }).limit(3);

    results.push(...threeMatch);
  }

  // 2️⃣ Two-field matches
  if (results.length < 3) {
    const twoMatchConditions = [];

    if (normalized.bhk !== null && normalized.sector !== null) {
      twoMatchConditions.push({
        ...baseQuery,
        bedrooms: normalized.bhk,
        Sector: normalized.sector.toString(),
      });
    }

    if (normalized.bhk !== null && normalized.maxPrice !== null) {
      twoMatchConditions.push({
        ...baseQuery,
        bedrooms: normalized.bhk,
        monthlyRent: { $lte: normalized.maxPrice },
      });
    }

    if (normalized.sector !== null && normalized.maxPrice !== null) {
      twoMatchConditions.push({
        ...baseQuery,
        Sector: normalized.sector.toString(),
        monthlyRent: { $lte: normalized.maxPrice },
      });
    }

    for (const condition of twoMatchConditions) {
      if (results.length >= 3) break;

      const matches = await RentalProperty.find(condition).limit(3);
      for (const m of matches) {
        if (!results.find(r => r._id.equals(m._id))) {
          results.push(m);
          if (results.length >= 3) break;
        }
      }
    }
  }

  // 3️⃣ One-field matches
  if (results.length < 3) {
    const oneMatchConditions = [];

    if (normalized.bhk !== null) {
      oneMatchConditions.push({
        ...baseQuery,
        bedrooms: normalized.bhk,
      });
    }

    if (normalized.sector !== null) {
      oneMatchConditions.push({
        ...baseQuery,
        Sector: normalized.sector.toString(),
      });
    }

    if (normalized.maxPrice !== null) {
      oneMatchConditions.push({
        ...baseQuery,
        monthlyRent: { $lte: normalized.maxPrice },
      });
    }

    for (const condition of oneMatchConditions) {
      if (results.length >= 3) break;

      const matches = await RentalProperty.find(condition).limit(3);
      for (const m of matches) {
        if (!results.find(r => r._id.equals(m._id))) {
          results.push(m);
          if (results.length >= 3) break;
        }
      }
    }
  }

  return results.slice(0, 3);
}

/* ================================
   BREVO MAILER
================================ */
async function sendResultsEmail(results, spokenEmail = null, mobileNumber = null) {
  if (!results || results.length === 0) {
    console.log("📭 No results to email");
    return;
  }

  let recipientEmail = spokenEmail;

  // 1️⃣ If mobile number is provided, try finding user
  if (mobileNumber) {
    const user = await User.findOne({ mobileNumber });

    if (user?.email) {
      recipientEmail = user.email;
    } else {
      // Store pending recommendations
      await PendingRecommendation.findOneAndUpdate(
        { mobileNumber },
        { 
          mobileNumber,
          propertyIds: results.map(r => r._id),
        },
        { upsert: true, new: true }
      );

      console.log("⏳ Stored pending recommendations for:", mobileNumber);
      return;
    }
  }

  // Fallback
  if (!recipientEmail) {
    recipientEmail = "support@ggnhome.com";
  }

  const linksHtml = results
    .map((p, index) => {
      const id = encodeURIComponent(p._id.toString());
      return `
        <li>
          <a href="https://ggnhome.com/Rentaldetails/${id}" target="_blank">
            ${index + 1}. ${p.title || "Rental Property"}
          </a>
          — ₹${p.monthlyRent} (Sector ${p.Sector})
        </li>
      `;
    })
    .join("");

  const htmlContent = `
    <h2>🏠 Rental Property Matches</h2>
    <p>We found the following matching properties:</p>
    <ul>${linksHtml}</ul>
    <p>— ggnHome Automation</p>
  `;

  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "ggnHome",
          email: "support@ggnhome.com",
        },
        to: [
          {
            email: recipientEmail,
            name: "ggnHome User",
          },
        ],
        subject: "🏠 Rental Property Matches Found",
        htmlContent,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
          accept: "application/json",
        },
      }
    );

    console.log("📧 Email sent via Brevo");
  } catch (err) {
    console.error("❌ Failed to send email:", err.response?.data || err.message);
  }
}

User.watch().on("change", async (change) => {
  if (change.operationType !== "update") return;

  const updatedUser = await User.findById(change.documentKey._id);
  if (!updatedUser?.mobileNumber || !updatedUser?.email) return;

  const pending = await PendingRecommendation.findOne({
    mobileNumber: updatedUser.mobileNumber,
  });

  if (!pending) return;

  const properties = await RentalProperty.find({
    _id: { $in: pending.propertyIds },
  });

  if (properties.length > 0) {
    await sendResultsEmail(properties, updatedUser.email, updatedUser.mobileNumber);
  }

  await PendingRecommendation.deleteOne({ _id: pending._id });
  console.log("✅ Pending recommendations sent and cleared for:", updatedUser.mobileNumber);
});

/* ================================
   EXPORTS
================================ */
module.exports = {
  connectDB,
  RentalProperty,
  searchRentalProperties,
  sendResultsEmail,
  PendingRecommendation,
};