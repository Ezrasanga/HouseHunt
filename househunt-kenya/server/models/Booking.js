import mongoose from 'mongoose';

const terminationRequestSchema = new mongoose.Schema(
  {
    reason: { type: String, trim: true, required: true, maxlength: 1000 },
    requestedAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'DISPUTED', 'WITHDRAWN', 'AGREED', 'RESOLVED'],
      required: true,
    },
    respondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolution: { type: String, enum: ['MUTUAL_AGREEMENT', 'END_TENANCY', 'KEEP_ACTIVE', null], default: null },
    resolutionNote: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tenant is required'],
      index: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property is required'],
      index: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Landlord is required'],
      index: true,
    },
    moveInDate: {
      type: Date,
      required: [true, 'Move-in date is required'],
    },
    leaseMonths: {
      type: Number,
      required: [true, 'Lease duration is required'],
      min: [1, 'Lease duration must be at least 1 month'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'],
      default: 'PENDING',
      index: true,
    },
    completionRequestedBy: {
      type: String,
      enum: ['TENANT', 'LANDLORD', null],
      default: null,
    },
    completionRequestedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    terminationRequestStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'DISPUTED', 'WITHDRAWN', 'AGREED', 'RESOLVED'],
      default: 'NONE',
      index: true,
    },
    terminationReason: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    terminationRequestedAt: {
      type: Date,
      default: null,
    },
    terminationRespondedAt: {
      type: Date,
      default: null,
    },
    terminationResolvedAt: {
      type: Date,
      default: null,
    },
    terminationResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    terminationResolution: {
      type: String,
      enum: ['MUTUAL_AGREEMENT', 'END_TENANCY', 'KEEP_ACTIVE', null],
      default: null,
    },
    terminationResolutionNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    terminationHistory: {
      type: [terminationRequestSchema],
      default: [],
    },
    isTestData: {
      type: Boolean,
      default: false,
      index: true,
    },
    testDataMarkedAt: {
      type: Date,
      default: null,
    },
    testDataMarkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
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

bookingSchema.index({ tenant: 1, property: 1 });
bookingSchema.index({ landlord: 1, status: 1 });

export default mongoose.model('Booking', bookingSchema);
