import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: function requiredForPropertyPayment() {
        return this.purpose === 'CONTACT_UNLOCK' || this.purpose === 'LISTING_BOOST';
      },
      default: null,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['CONTACT_UNLOCK', 'LISTING_BOOST'],
      required: true,
      index: true,
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: function requiredForContactUnlock() {
        return this.purpose === 'CONTACT_UNLOCK';
      },
      default: null,
      index: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: function requiredForPropertyPayment() {
        return this.purpose === 'CONTACT_UNLOCK' || this.purpose === 'LISTING_BOOST';
      },
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount must be a positive number'],
    },
    currency: {
      type: String,
      enum: ['KES', 'USD', 'EUR'],
      default: 'KES',
      uppercase: true,
      trim: true,
    },
    method: {
      type: String,
      enum: ['MPESA', 'CARD', 'BANK'],
      required: [true, 'Payment method is required'],
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    mpesaReceipt: {
      type: String,
      trim: true,
      default: '',
    },
    merchantRequestId: {
      type: String,
      trim: true,
      default: '',
    },
    checkoutRequestId: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    transactionDate: {
      type: Date,
      default: Date.now,
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

paymentSchema.index({ tenant: 1, landlord: 1 });
paymentSchema.index({ property: 1, purpose: 1, status: 1 });

export default mongoose.model('Payment', paymentSchema);
