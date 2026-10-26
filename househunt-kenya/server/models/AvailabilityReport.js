import mongoose from 'mongoose';

const availabilityReportSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['already-rented', 'landlord-unresponsive', 'incorrect-details', 'other'],
      required: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
      default: 'OPEN',
      index: true,
    },
    resolutionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

availabilityReportSchema.index(
  { property: 1, reporter: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } }
);

export default mongoose.model('AvailabilityReport', availabilityReportSchema);
