import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    county: { type: String, trim: true, required: [true, 'County is required'] },
    town: { type: String, trim: true, required: [true, 'Town is required'] },
    estate: { type: String, trim: true, default: '' },
    street: { type: String, trim: true, default: '' },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (value) {
            return value.length === 2;
          },
          message: 'Coordinates must be an array of [longitude, latitude]',
        },
      },
    },
  },
  { _id: false }
);

const amenitySchema = new mongoose.Schema(
  {
    wifi: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    water: { type: Boolean, default: false },
    electricity: { type: Boolean, default: false },
    security: { type: Boolean, default: false },
    balcony: { type: Boolean, default: false },
    furnished: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Property description is required'],
      trim: true,
      minlength: [20, 'Description must be at least 20 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be a positive number'],
    },
    propertyType: {
      type: String,
      enum: ['Apartment', 'Bedsitter', 'Single Room', 'Studio', 'Maisonette', 'Hostel', 'Office', 'Shop', 'Warehouse'],
      required: [true, 'Property type is required'],
      index: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    bedrooms: {
      type: Number,
      required: [true, 'Bedroom count is required'],
      min: [0, 'Bedrooms must be a non-negative number'],
    },
    bathrooms: {
      type: Number,
      required: [true, 'Bathroom count is required'],
      min: [0, 'Bathrooms must be a non-negative number'],
    },
    amenities: {
      type: amenitySchema,
      default: () => ({}),
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (value) {
          return value.length <= 20;
        },
        message: 'A maximum of 20 images is allowed',
      },
    },
    coverImage: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'OCCUPIED', 'PENDING', 'HIDDEN'],
      default: 'PENDING',
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: [0, 'Views cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

propertySchema.index({ 'location.coordinates': '2dsphere' });
propertySchema.index({ owner: 1, status: 1 });
propertySchema.index({ isApproved: 1, featured: -1, status: 1 });

propertySchema.virtual('fullAddress').get(function () {
  if (!this.location) return '';
  return [this.location.street, this.location.estate, this.location.town, this.location.county]
    .filter(Boolean)
    .join(', ');
});

export default mongoose.model('Property', propertySchema);
