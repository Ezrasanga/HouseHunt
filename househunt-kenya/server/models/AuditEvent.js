import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      enum: ['ADMIN', 'LANDLORD', 'TENANT', 'SYSTEM'],
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    resourceType: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    resourceId: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    outcome: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditEventSchema.index({ createdAt: -1 });

export default mongoose.model('AuditEvent', auditEventSchema);
