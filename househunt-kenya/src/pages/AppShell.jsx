import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/common/Icon";
import useAuth from "../hooks/useAuth";
import useBookings from "../hooks/useBookings";
import useProperties from "../hooks/useProperties";
import useSavedHomes from "../hooks/useSavedHomes";
import { getAnnouncements } from "../services/announcementService";
import {
  changePassword,
  completePasswordReset,
  requestPasswordReset,
} from "../services/authService";
import {
  closeTestBooking,
  getAdminBookings,
  markBookingAsTestData,
  resolveEarlyTermination,
  resolveBookingAvailability,
} from "../services/bookingService";
import {
  createPropertyPayment,
  getPropertyPaymentById,
  getPropertyPayment,
  getPropertyPaymentFees,
  getUnlockedPropertyIds,
  initiateStkPush,
  queryStkPushStatus,
} from "../services/paymentService";
import { uploadPropertyMedia } from "../services/mediaUploadService";
import { deleteUser, getUsers, updateUserStatus } from "../services/userService";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Hero from "../components/layout/Hero";
import SearchBar from "../components/layout/SearchBar";
import PropertyGrid from "../components/property/PropertyGrid";
import PropertyPagination from "../components/property/PropertyPagination";
import PropertyGallery from "../components/property/PropertyGallery";
import PropertyDetails from "../components/property/PropertyDetails";
import SavedHomes from "../components/property/SavedHomes";
import AdminActivityLog from "../components/admin/AdminActivityLog";
import AdminAvailabilityReports from "../components/admin/AdminAvailabilityReports";
import AdminListingQualityReview from "../components/admin/AdminListingQualityReview";
import PropertyActions from "../components/property/PropertyActions";
import NotFound from "./NotFound";
import EmptyState from "../components/common/EmptyState";
import Modal from "../components/common/Modal";
import Pagination from "../components/common/Pagination";
import Toast from "../components/common/Toast";
import { formatAvailabilityConfirmation } from "../utils/availability";
import "../styles/app.css";

// ── MODERATION ────────────────────────────────────────────────────────────────
const BANNED = ["porn","pornography","xxx","nude","naked","pussy","dick","cock","fuck","shit","bitch","whore","slut","nigger","faggot","bastard","cunt","retard","escort","prostitute","hooker","cocaine","heroin","kill yourself","kys","insult","stupid idiot"];
const dirty = t => { if(!t) return false; const l=t.toLowerCase(); return BANNED.some(w=>l.includes(w)); };
const dirtyObj = o => [o.title,o.location,o.rules,o.rooms,...(o.tags||[])].some(dirty);
const profileFields = user => ({
  firstName: user?.data?.firstName || user?.data?.name?.split(" ")[0] || "",
  lastName: user?.data?.lastName || user?.data?.name?.split(" ").slice(1).join(" ") || "",
  phone: user?.data?.phone || "",
  whatsapp: user?.data?.whatsapp || "",
  ig: user?.data?.ig || "",
  fb: user?.data?.fb || "",
  tt: user?.data?.tt || "",
  tw: user?.data?.tw || "",
  profileImage: user?.data?.profileImage || "",
});

// ── DATA ──────────────────────────────────────────────────────────────────────
const APP_INITIALIZED_AT = Date.now();
const KES = n=>`KSh ${Number(n).toLocaleString()}`;
const todayStr = ()=>new Date().toISOString().split("T")[0];
const leaseTermEndsAt = booking => {
  const moveInDate = new Date(booking?.moveInDate);
  const leaseMonths = Number(booking?.leaseMonths);
  if (Number.isNaN(moveInDate.getTime()) || !Number.isInteger(leaseMonths) || leaseMonths < 1) return null;

  const monthStart = new Date(Date.UTC(
    moveInDate.getUTCFullYear(),
    moveInDate.getUTCMonth() + leaseMonths,
    1
  ));
  const lastDayOfMonth = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    0
  )).getUTCDate();
  return new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    Math.min(moveInDate.getUTCDate(), lastDayOfMonth) + 1
  ));
};
const leaseTermEndLabel = booking => {
  const endsAt = leaseTermEndsAt(booking);
  return endsAt
    ? new Date(endsAt.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "UTC" })
    : "";
};
const externalTenancyFor = property => property?.externalTenancies?.find(tenancy => !tenancy.endedAt) || null;
const externalLeaseTermEndsAt = tenancy => tenancy ? leaseTermEndsAt(tenancy) : null;
const externalLeaseEndLabel = tenancy => {
  const endsAt = externalLeaseTermEndsAt(tenancy);
  return endsAt
    ? new Date(endsAt.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "UTC" })
    : "";
};
const externalDateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "UTC" });
};
const bookingLocation = location => {
  if (typeof location === "string") return location;
  if (!location || typeof location !== "object") return "";
  return [location.estate, location.town, location.county]
    .filter(part => typeof part === "string" && part.trim())
    .join(", ");
};
const propertyTypeForApi = type => type === "House" || type === "Penthouse" ? "Apartment" : type === "Room" ? "Single Room" : type;
const amenityOptions = [
  ["wifi", "Wi-Fi"],
  ["parking", "Parking"],
  ["water", "Water"],
  ["electricity", "Electricity"],
  ["security", "Security"],
  ["balcony", "Balcony"],
  ["furnished", "Furnished"],
  ["petFriendly", "Pet friendly"],
];
const emptyAmenitySelection = () => Object.fromEntries(amenityOptions.map(([key]) => [key, false]));
const emptyPropertyForm = () => ({
  title: "",
  location: "",
  rent: "",
  rooms: "",
  rules: "",
  type: "Apartment",
  tags: "",
  amenities: emptyAmenitySelection(),
});
const amenityTagKey = value => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
const propertySearchQuery = (search, budget, type, page, filters) => {
  const query = { page, search: search.trim() };
  if (type) query.propertyType = type;
  if (filters.county.trim()) query.county = filters.county.trim();
  if (filters.town.trim()) query.town = filters.town.trim();
  if (filters.bedrooms !== "") query.bedrooms = filters.bedrooms;
  if (filters.amenities.length) query.amenities = filters.amenities.join(",");
  if (filters.sort !== "featured") query.sort = filters.sort;
  if (budget === "low") query.maxPrice = 14999;
  if (budget === "mid") {
    query.minPrice = 15000;
    query.maxPrice = 35000;
  }
  if (budget === "high") query.minPrice = 35001;
  return query;
};
const propertyPayload = (form, media) => {
  const locationParts = form.location.split(",").map(part => part.trim()).filter(Boolean);
  const rooms = String(form.rooms || "");
  const bedroomMatch = rooms.match(/(\d+)\s*bed/i);
  const bathroomMatch = rooms.match(/(\d+)\s*bath/i);
  const description = [form.rules, rooms].filter(Boolean).join(" ").trim() || `${form.title} property listing.`;
  const tags = form.tags ? form.tags.split(",").map(tag => amenityTagKey(tag.trim())).filter(Boolean) : [];
  const amenities = form.amenities || Object.fromEntries(
    amenityOptions.map(([key]) => [key, tags.includes(amenityTagKey(key))])
  );

  return {
    title: form.title,
    description: description.length >= 20 ? description : `${description} Available for viewing and enquiries.`,
    price: Number(form.rent),
    propertyType: propertyTypeForApi(form.type),
    location: {
      county: locationParts.at(-1) || form.location,
      town: locationParts[0] || form.location,
      estate: locationParts.length > 2 ? locationParts[0] : "",
    },
    bedrooms: Number(bedroomMatch?.[1] || 0),
    bathrooms: Number(bathroomMatch?.[1] || 0),
    amenities: Object.fromEntries(amenityOptions.map(([key]) => [key, Boolean(amenities[key])])),
    images: media.filter(item => item.type === "image" && !item.url.startsWith("blob:")).map(item => item.url),
    media: media.filter(item => item.publicId && !item.url.startsWith("blob:")).map(({ url, type, publicId }) => ({ url, type, publicId })),
  };
};

function PropertySkeletons() {
  return <div className="pgrid" aria-label="Loading properties" aria-busy="true">
    {[1, 2, 3].map(item => <div className="pcard skeleton-card" key={item}>
      <div className="skeleton-block skeleton-thumb" />
      <div className="skeleton-copy"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>
    </div>)}
  </div>;
}

function releaseMediaPreviews(media) {
  media.forEach(item => {
    if (item.file && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
  });
}

// ── PROP CARD COMPONENT ───────────────────────────────────────────────────────


// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function AppShell({ initialTab = "home", authMode = null, propertyId = null, notFound = false }) {
  const { user, login, register, updateProfile, logout: logoutUser, isLoading: authLoading } = useAuth();
  const {
    favorites,
    loading: savedHomesLoading,
    error: savedHomesError,
    retry: retrySavedHomes,
    toggleFavorite: toggleSavedHome,
    clearSavedHomes: clearSavedHomesRequest,
  } = useSavedHomes(user);
  const navigate = useNavigate();
  const location = useLocation();
  const tab = initialTab;
  const setTab = nextTab => {
    const pathByTab = { home: "/", guide: "/guide", tenant: "/tenant", saved: "/saved", landlord: "/landlord", admin: "/admin" };
    navigate(pathByTab[nextTab] || "/");
  };
  const [search, setSearch] = useState("");
  const [budget, setBudget] = useState("");
  const [ptype, setPtype] = useState("");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [amenities, setAmenities] = useState([]);
  const [sort, setSort] = useState("featured");
  const [propertyPage, setPropertyPage] = useState(1);
  const [currentTime, setCurrentTime] = useState(APP_INITIALIZED_AT);
  const propertyFilters = { county, town, bedrooms, amenities, sort };
  const publicPropertyQuery = user?.role === "admin" || user?.role === "landlord"
    ? {}
    : propertySearchQuery(search, budget, ptype, propertyPage, propertyFilters);
  const {
    properties: props,
    pagination: propertyPagination,
    loading: propertiesLoading,
    error: propertiesError,
    refresh: refreshProperties,
    loadProperty,
    addProperty,
    removeProperty,
    updateProperty: updatePropertyApi,
    approveProperty: approvePropertyApi,
    confirmPropertyAvailability: confirmPropertyAvailabilityApi,
    updatePropertyStatus: updatePropertyStatusApi,
    featureProperty: featurePropertyApi,
  } = useProperties({
    limit: user?.role === "admin" ? 100 : user?.role === "landlord" ? 50 : 12,
    query: publicPropertyQuery,
  });
  const {
    tenantBookings,
    landlordBookings,
    activeLandlordBookings,
    landlordBookingsPagination,
    activeTenancyLoading,
    activeTenancyError,
    tenantLoading,
    landlordLoading,
    tenantError,
    landlordError,
    loadLandlordBookings,
    loadActiveLandlordBookings,
    createBooking,
    cancelBooking,
    approveBooking,
    rejectBooking,
    updateBookingCompletion,
    updateEarlyTermination,
  } = useBookings();
  const [landlords, setLandlords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminBookings, setAdminBookings] = useState([]);
  const [adminBookingsPagination, setAdminBookingsPagination] = useState(null);
  const [adminBookingsLoading, setAdminBookingsLoading] = useState(false);
  const [adminBookingsError, setAdminBookingsError] = useState("");
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [adminUserCounts, setAdminUserCounts] = useState({ total: 0, landlords: 0, tenants: 0 });
  const [anns, setAnns] = useState([]);
  const [tenantAnnouncements, setTenantAnnouncements] = useState([]);
  const [announcementError, setAnnouncementError] = useState("");
  const [paymentConfigError, setPaymentConfigError] = useState("");
  const [unlockedPropertiesError, setUnlockedPropertiesError] = useState("");
  const [toast, setToast] = useState(null);

  const [selProp, setSelProp] = useState(null);
  const [midx, setMidx] = useState(0);
  const authRole = location.state?.role
    || ({ "/admin": "admin", "/landlord": "landlord", "/tenant": "tenant" }[location.state?.from?.pathname])
    || "tenant";
  const [authModalState, setAuthModalState] = useState(null);
  const authModal = authMode ? authRole : authModalState;
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [payPhone, setPayPhone] = useState(user?.data?.phone || "");
  const [payError, setPayError] = useState("");
  const [unlockedPropertyAccess, setUnlockedPropertyAccess] = useState({ userId: null, ids: [] });
  const unlockedPropertyIds = unlockedPropertyAccess.userId === user?.data?.id ? unlockedPropertyAccess.ids : [];
  const [completionLoadingId, setCompletionLoadingId] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [confModal, setConfModal] = useState(null);
  const [externalTenancyForm, setExternalTenancyForm] = useState({ tenantName: "", moveInDate: "", leaseMonths: "6" });
  const externalTenancyFormRef = useRef(externalTenancyForm);
  const [externalTenancyError, setExternalTenancyError] = useState("");
  const [propertyStatusUpdatingId, setPropertyStatusUpdatingId] = useState("");
  const [bookingProperty, setBookingProperty] = useState(null);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({ moveInDate: "", leaseMonths: "6", notes: "" });
  const [bookingFormError, setBookingFormError] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [ldTab, setLdTab] = useState("profile");
  const [adTab, setAdTab] = useState("overview");
  const [bookingConflictId, setBookingConflictId] = useState("");
  const [pendMedia, setPendMedia] = useState([]);
  const [dragOv, setDragOv] = useState(false);
  const [form, setForm] = useState(emptyPropertyForm);
  const [editingProperty, setEditingProperty] = useState(null);
  const [profileForm, setProfileForm] = useState(() => profileFields(user));
  const [cwarn, setCwarn] = useState(false);
  const [authF, setAuthF] = useState({
    name: "",
    email: "",
    password: "",
    mode: authMode === "register" && authRole === "admin" ? "login" : authMode ?? "login",
  });
  const [authErr, setAuthErr] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authFieldErrors, setAuthFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetForm, setPasswordResetForm] = useState({ newPassword: "", confirmPassword: "" });
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formInvalid, setFormInvalid] = useState({});
  const [propLoading, setPropLoading] = useState(false);
  const [availabilityConfirmingId, setAvailabilityConfirmingId] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);
  const [adminListingLoading, setAdminListingLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [annF, setAnnF] = useState({title:"",body:"",type:"success"});
  const [admListF, setAdmListF] = useState({title:"",location:"",rent:"",rooms:"",type:"Apartment",rules:"",tags:""});
  const [admMedia, setAdmMedia] = useState([]);
  const [settings, setSettings] = useState({boostFee:200,unlockFee:100,requireApproval:false});
  const fileRef = useRef();
  const admFileRef = useRef();
  const modalRef = useRef(null);
  const authNameRef = useRef(null);
  const authEmailRef = useRef(null);
  const authPasswordRef = useRef(null);
  const propertyPaymentStatusCheckInFlight = useRef(false);
  const previousAuthModal = useRef(authModal);
  const modalOpenerRef = useRef(null);
  const mainRef = useRef(null);
  const previousPathname = useRef(location.pathname);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const closeModal = useCallback(() => {
    setSelProp(null);
    if (location.pathname.startsWith("/property/")) {
      const returnTo = location.state?.from;
      navigate(returnTo?.pathname
        ? { pathname: returnTo.pathname, search: returnTo.search, hash: returnTo.hash }
        : typeof returnTo === "string" ? returnTo : "/", { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

  const setAuthModal = useCallback(nextModal => {
    if (authMode) {
      if (nextModal) {
        navigate(location.pathname, { replace: true, state: { ...location.state, role: nextModal } });
      } else {
        navigate("/", { replace: true });
      }
      return;
    }
    setAuthModalState(nextModal);
  }, [authMode, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (previousAuthModal.current === authModal) return;
    previousAuthModal.current = authModal;
    setAuthF(current => ({
      name: "",
      email: "",
      password: "",
      mode: authModal === "admin" ? "login" : authMode || (current.mode === "register" ? "register" : "login"),
    }));
    setAuthErr("");
    setAuthNotice("");
    setAuthFieldErrors({});
    setShowPassword(false);
  }, [authModal, authMode]);

  useEffect(() => {
    const modalOpen = Boolean(authModal || payModal || confModal || passwordModalOpen || bookingFormOpen || selProp);
    if (!modalOpen) {
      modalOpenerRef.current?.focus?.();
      modalOpenerRef.current = null;
      return undefined;
    }
    if (!modalOpenerRef.current) modalOpenerRef.current = document.activeElement;
    const modal = modalRef.current;
    modal?.focus();
    const handleKeyDown = event => {
      if (event.key === "Escape") {
        if (confModal) setConfModal(null);
        else if (bookingFormOpen) setBookingFormOpen(false);
        else if (authModal) setAuthModal(null);
        else if (passwordModalOpen && !passwordSaving) setPasswordModalOpen(false);
        else if (payModal) setPayModal(null);
        else if (propertyId || selProp) closeModal();
      }
      if (event.key !== "Tab" || !modal) return;
      const focusable = modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!modal.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [authModal, bookingFormOpen, closeModal, confModal, passwordModalOpen, passwordSaving, payModal, propertyId, selProp, setAuthModal]);

  useEffect(() => {
    const titles = {
      home: "Find a Home",
      saved: "Saved Homes",
      guide: "How It Works",
      tenant: "Tenant Dashboard",
      landlord: "Landlord Dashboard",
      admin: "Admin Dashboard",
    };
    document.title = notFound
      ? "Page Not Found | HouseHunt Kenya"
      : propertyId && selProp
        ? `${selProp.title} | HouseHunt Kenya`
        : authMode
          ? `${authMode === "register" ? "Create Account" : authMode === "reset" ? "Reset Password" : "Sign In"} | HouseHunt Kenya`
          : `${titles[tab] || "HouseHunt Kenya"} | HouseHunt Kenya`;
  }, [authMode, notFound, propertyId, selProp, tab]);

  useEffect(() => {
    if (previousPathname.current === location.pathname) return;
    const previous = previousPathname.current;
    previousPathname.current = location.pathname;
    if (location.pathname.startsWith("/property/") || previous.startsWith("/property/")) return;
    window.scrollTo({ top: 0, behavior: "auto" });
    mainRef.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [location.pathname, tab]);

  useEffect(() => {
    if (!propertyId) return undefined;

    let active = true;
    loadProperty(propertyId)
      .then(property => { if (active) setSelProp(property); })
      .catch(() => { if (active) setSelProp(null); });

    return () => { active = false; };
  }, [loadProperty, propertyId]);

  useEffect(() => {
    let active = true;
    getAnnouncements()
      .then(items => { if (active) setTenantAnnouncements(items); })
      .catch(error => { if (active) setAnnouncementError(error.response?.data?.message || error.message || "Unable to load announcements."); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getPropertyPaymentFees()
      .then(fees => {
        if (active) setSettings(current => ({ ...current, ...fees }));
      })
      .catch(error => {
        if (active) setPaymentConfigError(error.response?.data?.message || error.message || "Unable to load payment pricing.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (user?.role !== "tenant") return undefined;
    getUnlockedPropertyIds()
      .then(ids => {
        if (active) {
          setUnlockedPropertyAccess({ userId: user.data.id, ids });
          setUnlockedPropertiesError("");
        }
      })
      .catch(error => {
        if (active) setUnlockedPropertiesError(error.response?.data?.message || error.message || "Unable to load unlocked properties.");
      });
    return () => { active = false; };
  }, [user?.role, user?.data?.id]);

  const clearAdminCollections = useCallback(() => {
    setAdminUsers([]);
    setLandlords([]);
    setTenants([]);
    setAdminUserCounts({ total: 0, landlords: 0, tenants: 0 });
    setAdminUsersError("");
  }, []);

  const loadAdminUsers = useCallback(async (page = 1) => {
    if (user?.role !== "admin") return;

    setAdminUsersLoading(true);
    setAdminUsersError("");

    try {
      const [usersResponse, landlordResponse, tenantResponse] = await Promise.all([
        getUsers({ page, limit: 100 }),
        getUsers({ role: "LANDLORD", page: 1, limit: 100 }),
        getUsers({ role: "TENANT", page: 1, limit: 100 }),
      ]);

      const nextUsers = usersResponse.users || [];
      setAdminUsers(nextUsers);
      setLandlords((landlordResponse.users || []).filter(userEntry => userEntry.role === "LANDLORD"));
      setTenants((tenantResponse.users || []).filter(userEntry => userEntry.role === "TENANT"));
      setAdminUserCounts({
        total: usersResponse.pagination?.total ?? nextUsers.length,
        landlords: landlordResponse.pagination?.total ?? (landlordResponse.users || []).length,
        tenants: tenantResponse.pagination?.total ?? (tenantResponse.users || []).length,
      });
    } catch (error) {
      const status = error.response?.status;
      const message = status === 403
        ? "Admin access is required to load users."
        : error.response?.data?.message || error.message || "Unable to load users.";
      setAdminUsersError(message);
    } finally {
      setAdminUsersLoading(false);
    }
  }, [user?.role]);

  const loadAdminBookings = useCallback(async (page = 1) => {
    if (user?.role !== "admin") return;
    setAdminBookingsLoading(true);
    setAdminBookingsError("");
    try {
      const result = await getAdminBookings({ page, limit: 100 });
      setAdminBookings(result.bookings || []);
      setAdminBookingsPagination(result.pagination);
    } catch (error) {
      setAdminBookingsError(error.response?.data?.message || error.message || "Unable to load bookings.");
    } finally {
      setAdminBookingsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") return undefined;

    const timeoutId = setTimeout(() => {
      void loadAdminUsers();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadAdminUsers, user?.role]);

  useEffect(() => {
    if (user?.role !== "admin" || adTab !== "test-bookings") return;
    const timeoutId = setTimeout(() => {
      void loadAdminBookings();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [adTab, loadAdminBookings, user?.role]);

  const msg = (m, k="ok") => { setToast({m,k}); setTimeout(()=>setToast(null),3000); };
  const bookingStatusLabel = value => String(value || "PENDING").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  const bookingStatusTone = status => status === "PENDING" ? "sb-pd" : status === "APPROVED" ? "sb-av" : status === "REJECTED" ? "sb-fl" : status === "CANCELLED" ? "sb-bn" : "sb-tk";
  const updateSearch = value => { setSearch(value); setPropertyPage(1); };
  const updateBudget = value => { setBudget(value); setPropertyPage(1); };
  const updatePropertyType = value => { setPtype(value); setPropertyPage(1); };
  const updateCounty = value => { setCounty(value); setPropertyPage(1); };
  const updateTown = value => { setTown(value); setPropertyPage(1); };
  const updateBedrooms = value => { setBedrooms(value); setPropertyPage(1); };
  const updateAmenities = value => {
    setAmenities(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
    setPropertyPage(1);
  };
  const updateSort = value => { setSort(value); setPropertyPage(1); };
  const clearPropertyFilters = () => {
    setSearch("");
    setBudget("");
    setPtype("");
    setCounty("");
    setTown("");
    setBedrooms("");
    setAmenities([]);
    setSort("featured");
    setPropertyPage(1);
  };
  const removePropertyFilter = key => {
    if (key === "search") updateSearch("");
    else if (key === "budget") updateBudget("");
    else if (key === "type") updatePropertyType("");
    else if (key === "county") updateCounty("");
    else if (key === "town") updateTown("");
    else if (key === "bedrooms") updateBedrooms("");
    else if (key === "sort") updateSort("featured");
    else if (key.startsWith("amenity:")) updateAmenities(key.slice("amenity:".length));
  };
  const switchAuthMode = mode => {
    setAuthF(current => ({name:"",email:current.email,password:"",mode}));
    setAuthErr("");
    setAuthNotice("");
    setAuthFieldErrors({});
    setShowPassword(false);
    setPasswordResetForm({ newPassword: "", confirmPassword: "" });
  };
  const sendPasswordResetLink = async () => {
    setAuthErr("");
    setAuthNotice("");
    if (!authF.email || !/^\S+@\S+\.\S+$/.test(authF.email)) {
      setAuthErr("Enter a valid email address.");
      return;
    }

    setPasswordResetLoading(true);
    try {
      const response = await requestPasswordReset(authF.email);
      setAuthNotice(response.data.message || "If an account exists for that email, password reset instructions will be sent.");
    } catch (error) {
      setAuthErr(error.response?.data?.message || error.message || "Unable to request a password reset.");
    } finally {
      setPasswordResetLoading(false);
    }
  };
  const submitPasswordReset = async () => {
    setAuthErr("");
    setAuthNotice("");
    if (passwordResetForm.newPassword.length < 8) {
      setAuthErr("New password must be at least 8 characters.");
      return;
    }
    if (passwordResetForm.newPassword !== passwordResetForm.confirmPassword) {
      setAuthErr("New password and confirmation do not match.");
      return;
    }

    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
      setAuthErr("This password reset link is missing its token. Request a new reset link.");
      return;
    }

    setPasswordResetLoading(true);
    try {
      const response = await completePasswordReset({
        token,
        newPassword: passwordResetForm.newPassword,
      });
      setPasswordResetForm({ newPassword: "", confirmPassword: "" });
      switchAuthMode("login");
      setAuthNotice(response.data.message || "Password reset successfully. You can now sign in.");
      navigate("/login", { replace: true });
    } catch (error) {
      setAuthErr(error.response?.data?.message || error.message || "Unable to reset password.");
    } finally {
      setPasswordResetLoading(false);
    }
  };
  const validateAuth = () => {
    if (authF.mode === "register" && !authF.name.trim()) { authNameRef.current?.focus(); return "Full name is required."; }
    if (!authF.email || !/^\S+@\S+\.\S+$/.test(authF.email)) { authEmailRef.current?.focus(); return "Enter a valid email address."; }
    if (!authF.password || authF.password.length < 8) { authPasswordRef.current?.focus(); return "Password must be at least 8 characters."; }
    return "";
  };

  const sorted = [...props]
    .filter(p => user?.role==="admin" ? true : p.approved!==false)
    .sort((a,b) => sort === "featured" ? (b.boosted?1:0)-(a.boosted?1:0) : 0);

  const filtered = sorted;
  const featuredProps = propertyPage === 1 && sort === "featured" ? filtered.filter(p=>p.boosted).slice(0,4) : [];
  const featuredIds = new Set(featuredProps.map(property => property.id));
  const remainingProps = filtered.filter(property => !featuredIds.has(property.id));

  const myProps = user?.role==="landlord" ? props.filter(p=>p.landlordId===user.data.id) : [];
  const myAvailable = myProps.filter(p=>p.status==="available");
  const myTaken = myProps.filter(p=>p.status==="taken");
  const myBoosted = myProps.filter(p=>p.boosted);
  const myPending = myProps.filter(p=>p.approved===false);
  const landlordDashboardNow = currentTime;
  const availabilityReminderMs = 30 * 24 * 60 * 60 * 1000;
  const boostReminderMs = 7 * 24 * 60 * 60 * 1000;
  const myAvailabilityDue = myProps.filter(property => {
    if (!property.approved || property.status !== "available") return false;
    const confirmedAt = property.availabilityConfirmedAt ? new Date(property.availabilityConfirmedAt).getTime() : NaN;
    return !Number.isFinite(confirmedAt) || landlordDashboardNow - confirmedAt >= availabilityReminderMs;
  });
  const myBoostsExpiring = myProps.filter(property => {
    if (!property.boosted || !property.featuredUntil) return false;
    const expiresAt = new Date(property.featuredUntil).getTime();
    return Number.isFinite(expiresAt) && expiresAt > landlordDashboardNow && expiresAt - landlordDashboardNow <= boostReminderMs;
  });
  const myListingsNeedingDetails = myProps.map(property => {
    const missingDetails = [];
    if ((property.description || property.rules || "").trim().length < 80) missingDetails.push("Add more description");
    if (!property.media?.length) missingDetails.push("Add photos");
    if (!property.locationDetails?.estate) missingDetails.push("Add estate or neighbourhood");
    return { property, missingDetails };
  }).filter(item => item.missingDetails.length > 0);
  const isUnlocked = id => user?.role === "tenant" && unlockedPropertyIds.includes(id);
  const tenantUnlockedProps = user?.role==="tenant" ? props.filter(p=>isUnlocked(p.id)) : [];
  const unlockedRent = tenantUnlockedProps.reduce((sum,p)=>sum+p.rent,0);
  const tenantFirstName = user?.data?.name?.split(" ")[0] || "Tenant";
  const landFirstName = user?.data?.name?.split(" ")[0] || "Landlord";
  const totalAdminProperties = propertyPagination?.total ?? props.length;
  const adminPropertySetComplete = !propertyPagination || props.length >= totalAdminProperties;
  const adminPropertyStatusReady = !propertiesLoading && !propertiesError && adminPropertySetComplete;
  const flagged = adminPropertySetComplete ? props.filter(p=>p.status === "hidden" || p.flagged) : [];
  const pending = adminPropertySetComplete ? props.filter(p=>p.approved===false) : [];
  const taken = adminPropertySetComplete ? props.filter(p=>p.status === "taken") : [];
  const available = adminPropertySetComplete ? props.filter(p=>p.status === "available") : [];
  const hidden = adminPropertySetComplete ? props.filter(p=>p.status === "hidden") : [];
  const approved = adminPropertySetComplete ? props.filter(p=>p.approved !== false) : [];
  const adminPropertyStats = {
    total: totalAdminProperties,
    pending: adminPropertyStatusReady ? pending.length : null,
    approved: adminPropertyStatusReady ? approved.length : null,
    occupied: adminPropertyStatusReady ? taken.length : null,
    hidden: adminPropertyStatusReady ? hidden.length : null,
    available: adminPropertyStatusReady ? available.length : null,
  };

  // AUTH
  const doLogin = async role => {
    setAuthErr("");
    setAuthFieldErrors({});
    const validationError = validateAuth();
    if (validationError) {
      setAuthErr(validationError);
      return;
    }

    try {
      const nextUser = await login({
        email: authF.email,
        password: authF.password,
        role: String(role).toUpperCase(),
      });
      if (nextUser.role !== "admin") clearAdminCollections();
      setProfileForm(profileFields(nextUser));
      setAuthModalState(null);
      const requestedPath = location.state?.from;
      const dashboardPath = { admin: "/admin", landlord: "/landlord", tenant: "/tenant" }[nextUser.role] || "/";
      navigate(requestedPath?.pathname
        ? { pathname: requestedPath.pathname, search: requestedPath.search, hash: requestedPath.hash }
        : dashboardPath, { replace: true });
      msg(`Welcome back, ${nextUser.data.name.split(" ")[0]}!`, "ok");
    } catch (err) {
      setAuthErr(err.message || "Login failed.");
      setAuthFieldErrors(Object.fromEntries((err.fieldErrors || []).map(item => [item.field, item.message])));
    }
  };

  const doRegister = async role => {
    setAuthErr("");
    setAuthFieldErrors({});
    const validationError = validateAuth();
    if (validationError) {
      setAuthErr(validationError);
      return;
    }
    if (dirty(authF.name)) {
      setAuthErr("Name contains inappropriate content.");
      return;
    }

    try {
      const nextUser = await register({
        name: authF.name,
        email: authF.email,
        password: authF.password,
        role,
      });
      if (nextUser.role === "landlord") setProfileForm(profileFields(nextUser));
      clearAdminCollections();

      if (role === "landlord") {
        setLandlords(l => [...l, nextUser.data]);
      } else {
        setTenants(t => [...t, nextUser.data]);
      }

      setAuthModalState(null);
      navigate(nextUser.role === "landlord" ? "/landlord" : "/tenant", { replace: true });
      msg("Account created! Welcome 🎉", "ok");
    } catch (err) {
      setAuthErr(err.message || "Registration failed.");
      setAuthFieldErrors(Object.fromEntries((err.fieldErrors || []).map(item => [item.field, item.message])));
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
      clearAdminCollections();
      setTab("home");
      msg("Signed out.", "info");
    } catch (error) {
      msg(error.message || "Unable to sign out. Please try again.", "err");
    }
  };
  const toggleFavorite = id => {
    if (!user) {
      setAuthModal("tenant");
      return;
    }
    void toggleSavedHome(id).catch(error => msg(error.message || "Could not update saved homes.", "err"));
  };
  const shareProperty = async property => {
    const url = new URL(`/property/${encodeURIComponent(property.id)}`, window.location.origin).toString();
    const shareData = { title: property.title, text: `Take a look at ${property.title} on HouseHunt Kenya.`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error("Sharing is not available in this browser.");
      }
      await navigator.clipboard.writeText(url);
      msg("Listing link copied. You can share it with anyone.", "ok");
    } catch (error) {
      if (error.name !== "AbortError") msg(error.message || "Could not share this listing.", "err");
    }
  };

  // PROPERTY CRUD
  const deleteProp = (id, direct=false) => {
    if(direct){
      removeProperty(id)
        .then(() => {
          if(selProp?.id===id) setSelProp(null);
          msg("Listing deleted.","warn");
        })
        .catch(error => msg(error.response?.data?.message || error.message, "err"));
      return;
    }
    setConfModal({type:"delete",title:"Delete Listing",
      msg2:"This listing will be permanently removed.",
      onConfirm:()=>{ deleteProp(id,true); setConfModal(null); }});
  };

  const markTaken = id => {
    const initialForm = { tenantName: "", moveInDate: todayStr(), leaseMonths: "6" };
    externalTenancyFormRef.current = initialForm;
    setExternalTenancyForm(initialForm);
    setExternalTenancyError("");
    setConfModal({
      type: "external-tenancy",
      propertyId: id,
      title: "Record an external tenancy?",
      msg2: "Use this for a tenancy arranged outside HouseHunt. The listing will be marked or remain taken, and the tenant name and lease term recorded privately for you and admins. Active HouseHunt bookings cannot be replaced with an external record.",
      confirmLabel: "Record tenancy & mark taken",
      onConfirm: async () => {
        const formData = externalTenancyFormRef.current;
        const leaseMonths = Number(formData.leaseMonths);
        if (!formData.tenantName.trim() || !formData.moveInDate ||
            !Number.isInteger(leaseMonths) || leaseMonths < 1) {
          setExternalTenancyError("Enter the tenant name, move-in date, and a whole lease duration of at least one month.");
          return;
        }

        setExternalTenancyError("");
        setPropertyStatusUpdatingId(id);
        try {
          await updatePropertyStatusApi(id, "OCCUPIED", {
            externalTenancy: {
              tenantName: formData.tenantName.trim(),
              moveInDate: formData.moveInDate,
              leaseMonths,
            },
          });
          setConfModal(null);
          msg("External tenancy recorded. The listing is now marked taken.", "ok");
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to record the external tenancy.", "err");
        } finally {
          setPropertyStatusUpdatingId("");
        }
      },
    });
  };

  const markAvailable = id => {
    setConfModal({
      type: "external-vacancy",
      propertyId: id,
      title: "Confirm the property is vacant?",
      msg2: "Confirm that the recorded external tenancy has ended and the property is physically vacant. HouseHunt will keep the tenancy record and mark the listing available.",
      confirmLabel: "Confirm vacant & mark available",
      onConfirm: async () => {
        setPropertyStatusUpdatingId(id);
        try {
          await updatePropertyStatusApi(id, "AVAILABLE", { confirmVacant: true });
          setConfModal(null);
          msg("Vacancy confirmed. The listing is now available.", "ok");
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to confirm vacancy.", "err");
        } finally {
          setPropertyStatusUpdatingId("");
        }
      },
    });
  };

  const resolveLegacyOccupancy = id => {
    setConfModal({
      type: "admin-vacancy",
      propertyId: id,
      title: "Resolve an untracked occupied listing?",
      msg2: "Use this only after confirming there is no active HouseHunt booking and the property is physically vacant. The server blocks this correction while an active booking or external tenancy remains.",
      confirmLabel: "Confirm vacant & reopen listing",
      onConfirm: async () => {
        setPropertyStatusUpdatingId(id);
        try {
          await updatePropertyStatusApi(id, "AVAILABLE", { confirmVacant: true });
          setConfModal(null);
          msg("Legacy occupancy resolved. The listing is now available.", "ok");
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to resolve the listing status.", "err");
        } finally {
          setPropertyStatusUpdatingId("");
        }
      },
    });
  };

  const confirmAvailability = async id => {
    setAvailabilityConfirmingId(id);
    try {
      const updatedProperty = await confirmPropertyAvailabilityApi(id);
      if (selProp?.id === id) setSelProp(updatedProperty);
      msg("Availability confirmation updated.", "ok");
    } catch (error) {
      msg(error.response?.data?.message || error.message, "err");
    } finally {
      setAvailabilityConfirmingId("");
    }
  };

  const approveProp = id => {
    approvePropertyApi(id, true)
      .then(() => {
        msg("✅ Listing approved and live.","ok");
      })
      .catch(error => msg(error.response?.data?.message || error.message, "err"));
  };

  const flagProp = id => {
    approvePropertyApi(id, false)
      .then(() => {
        msg("🚩 Listing flagged and hidden.","warn");
      })
      .catch(error => msg(error.response?.data?.message || error.message, "err"));
  };

  const toggleAdminUserStatus = async (userEntry) => {
    if (!userEntry) return;

    const nextState = !userEntry.isActive;

    try {
      const updatedUser = await updateUserStatus(userEntry.id, nextState);
      setAdminUsers(current => current.map(item => item.id === updatedUser.id ? updatedUser : item));
      setLandlords(current => current.map(item => item.id === updatedUser.id ? updatedUser : item));
      setTenants(current => current.map(item => item.id === updatedUser.id ? updatedUser : item));
      msg(nextState ? "✅ User activated." : "🚫 User deactivated.", nextState ? "ok" : "warn");
    } catch (error) {
      msg(error.response?.data?.message || error.message || "Unable to update user status.", "err");
    } finally {
      setConfModal(null);
    }
  };

  const deleteAdminUser = async userEntry => {
    if (!userEntry) return;

    try {
      await deleteUser(userEntry.id);
      const nextUsers = adminUsers.filter(item => item.id !== userEntry.id);
      setAdminUsers(nextUsers);
      setLandlords(current => current.filter(item => item.id !== userEntry.id));
      setTenants(current => current.filter(item => item.id !== userEntry.id));
      setAdminUserCounts(current => ({
        total: Math.max(0, current.total - 1),
        landlords: userEntry.role === "LANDLORD" ? Math.max(0, current.landlords - 1) : current.landlords,
        tenants: userEntry.role === "TENANT" ? Math.max(0, current.tenants - 1) : current.tenants,
      }));
      msg("🗑️ User deleted.", "warn");
    } catch (error) {
      msg(error.response?.data?.message || error.message || "Unable to delete user.", "err");
    } finally {
      setConfModal(null);
    }
  };

  const addProp = async () => {
    setFormError("");
    setFormInvalid({});

    if(!form.title||!form.location||!form.rent){
      setFormInvalid({ title: !form.title, location: !form.location, rent: !form.rent });
      setFormError("Please complete all required fields before posting.");
      return;
    }
    if(dirtyObj(form)){
      setCwarn(true);
      setFormError("Inappropriate content detected. Please revise your listing.");
      msg("❌ Inappropriate content detected.","err");
      return;
    }

    setPropLoading(true);
    try {
      const mediaToSave = [...pendMedia];
      for (let index = 0; index < mediaToSave.length; index += 1) {
        if (!mediaToSave[index].file) continue;
        const uploadedMedia = await uploadPropertyMedia(mediaToSave[index].file);
        mediaToSave[index] = uploadedMedia;
        setPendMedia([...mediaToSave]);
      }
      if (editingProperty) {
        await updatePropertyApi(editingProperty.id, propertyPayload(form, mediaToSave));
      } else {
        await addProperty(propertyPayload(form, mediaToSave));
      }
      releaseMediaPreviews(pendMedia);
      setForm(emptyPropertyForm());
      setPendMedia([]); setCwarn(false); setEditingProperty(null);
      msg(editingProperty ? "Listing updated." : "Submitted for review.","ok");
      setLdTab("mylistings");
    } catch (error) {
      setFormError(error.response?.data?.message || error.message || "Unable to post listing.");
    } finally {
      setPropLoading(false);
    }
  };

  const saveProfile = async () => {
    const displayName = `${profileForm.firstName} ${profileForm.lastName}`.trim();
    if(dirty(displayName)){
      msg("❌ Name contains inappropriate content.","err");
      return;
    }
    setProfileSaving(true);
    try {
      await updateProfile(profileForm);
      msg("Profile saved!","ok");
    } catch (error) {
      msg(error.message || "Unable to save profile.","err");
    } finally {
      setProfileSaving(false);
    }
  };

  const submitPasswordChange = async event => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      if (!response.data.success) {
        throw new Error(response.data.message || "Unable to change password.");
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordSuccess("Password changed successfully.");
    } catch (error) {
      const responseData = error.response?.data;
      const details = responseData?.errors?.map(item => item.message).filter(Boolean) || [];
      setPasswordError(
        details.length
          ? `${responseData.message || "Validation failed"}: ${details.join(", ")}`
          : responseData?.message || error.message || "Unable to change password."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const beginEditProperty = property => {
    setEditingProperty(property);
    setForm({
      title: property.title || "",
      location: property.location || "",
      rent: String(property.rent || ""),
      rooms: property.rooms || "",
      rules: property.rules || "",
      type: property.type || "Apartment",
      tags: (property.tags || []).join(", "),
      amenities: property.amenities || Object.fromEntries(
        amenityOptions.map(([key]) => [
          key,
          (property.tags || []).some(tag => amenityTagKey(tag) === amenityTagKey(key)),
        ])
      ),
    });
    setPendMedia(property.media || []);
    setFormError("");
    setFormInvalid({});
    setCwarn(false);
    setLdTab("listing");
  };

  const handleFiles = (files, setter) => {
    const selectedFiles = Array.from(files || []);
    const validFiles = selectedFiles.filter(file => (
      ["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm", "video/quicktime"].includes(file.type)
      && file.size <= 50 * 1024 * 1024
    ));
    if (validFiles.length !== selectedFiles.length) {
      msg("Choose JPEG, PNG, WebP, or AVIF photos, or MP4, WebM, or MOV videos up to 50 MB each.", "err");
    }
    const addToMedia = setter || setPendMedia;
    const currentMedia = setter ? admMedia : pendMedia;
    const remainingSlots = Math.max(0, 20 - currentMedia.length);
    if (validFiles.length > remainingSlots) msg("A listing can have up to 20 photos and videos.", "err");
    addToMedia(current => [
      ...current,
      ...validFiles.slice(0, remainingSlots).map(file => ({
        url: URL.createObjectURL(file),
        type: file.type.startsWith("video/") ? "video" : "image",
        name: file.name,
        file,
      })),
    ]);
  };

  const openPropertyPayment = async ({ type, propId }) => {
    const purpose = type === "boost" ? "LISTING_BOOST" : "CONTACT_UNLOCK";
    setPayModal({ type, propId, paymentId: null, hasStkPush: false, status: null, amount: null, paymentLookupLoading: true });
    setPayPhone(user?.data?.phone || "");
    setPayError("");
    try {
      const pending = await getPropertyPayment(propId, purpose);
      if (pending) {
        setPayModal(current => current?.propId === propId && current?.type === type
          ? {
              ...current,
              paymentId: pending.id,
              hasStkPush: pending.hasStkPush,
              status: pending.status,
              amount: pending.amount,
              paymentLookupLoading: false,
            }
          : current);
      } else {
        setPayModal(current => current?.propId === propId && current?.type === type
          ? { ...current, paymentLookupLoading: false }
          : current);
      }
    } catch (error) {
      setPayError(error.response?.data?.message || error.message || "Unable to check for a pending payment.");
      setPayModal(current => current?.propId === propId && current?.type === type
        ? { ...current, paymentLookupLoading: false }
        : current);
    }
  };

  const handlePropertyPayment = async () => {
    if (!payModal || !payPhone.trim()) {
      setPayError("Enter the phone number that should receive the M-PESA prompt.");
      return;
    }
    if (payModal.hasStkPush && payModal.status === "PENDING") {
      setPayError("An M-PESA request is already active. Check its status instead of sending another prompt.");
      return;
    }

    setPayLoading(true);
    setPayError("");
    try {
      let paymentId = payModal.paymentId;
      if (!paymentId || payModal.status === "FAILED") {
        const payment = await createPropertyPayment({
          purpose: payModal.type === "boost" ? "LISTING_BOOST" : "CONTACT_UNLOCK",
          propertyId: payModal.propId,
          currency: "KES",
          method: "MPESA",
          phone: payPhone.trim(),
        });
        paymentId = payment.id;
        setPayModal(current => current ? {
          ...current,
          paymentId,
          amount: payment.amount,
          status: payment.status,
          hasStkPush: payment.hasStkPush,
        } : current);
        if (payment.status === "PENDING" && payment.hasStkPush) {
          setPayModal(current => current ? {
            ...current,
            message: "An M-PESA request is already active. Approve it on your phone or check its status.",
          } : current);
          return;
        }
      }

      const result = await initiateStkPush(paymentId, payPhone.trim());
      setPayModal(current => current ? {
        ...current,
        hasStkPush: true,
        status: "PENDING",
        message: result.responseDescription || "STK Push sent. Approve the request on your phone.",
      } : current);
    } catch (error) {
      setPayError(error.response?.data?.message || error.message || "Unable to initiate M-PESA STK Push.");
    } finally {
      setPayLoading(false);
    }
  };

  const refreshPropertyPaymentStatus = useCallback(async (queryDaraja = false) => {
    if (!payModal?.paymentId || propertyPaymentStatusCheckInFlight.current) return;
    propertyPaymentStatusCheckInFlight.current = true;
    setPayError("");
    try {
      const queryResult = queryDaraja ? await queryStkPushStatus(payModal.paymentId) : null;
      const payment = queryResult?.payment || await getPropertyPaymentById(payModal.paymentId);
      if (payment.status === "SUCCESS") {
        if (payment.purpose === "CONTACT_UNLOCK") {
          setUnlockedPropertyAccess(current => {
            const ids = current.userId === user?.data?.id ? current.ids : [];
            return {
              userId: user?.data?.id || null,
              ids: ids.includes(payment.property) ? ids : [...ids, payment.property],
            };
          });
        }
        setPayModal(null);
        msg(payment.purpose === "LISTING_BOOST"
          ? "M-PESA payment confirmed. Your listing is boosted for 30 days."
          : "M-PESA payment confirmed. Property contacts and full location are unlocked.", "ok");
        try {
          const updatedProperty = await loadProperty(payment.property);
          if (selProp?.id === payment.property) setSelProp(updatedProperty);
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Payment was confirmed, but listing details could not be refreshed.", "err");
        }
      } else {
        setPayModal(current => current ? {
          ...current,
          status: payment.status,
          hasStkPush: payment.status === "FAILED" ? false : Boolean(payment.hasStkPush),
          message: payment.status === "FAILED"
            ? queryResult?.resultDescription || "Payment was not completed. You can try again."
            : queryResult?.resultDescription
              ? `Daraja reports: ${queryResult.resultDescription}. Waiting for final confirmation.`
              : "Payment is still pending. Approve the request on your phone if it is waiting there.",
        } : current);
      }
    } catch (error) {
      setPayError(error.response?.data?.message || error.message || "Unable to refresh payment status.");
    } finally {
      propertyPaymentStatusCheckInFlight.current = false;
    }
  }, [loadProperty, payModal, refreshProperties, selProp?.id, user?.data?.id]);

  const openBookingForm = property => {
    if (!user || user.role !== "tenant") {
      setAuthModal("tenant");
      return;
    }

    if (!property || property.approved === false || property.status !== "available") {
      msg("This property is not currently available for booking.", "warn");
      return;
    }

    setBookingProperty(property);
    setBookingForm({ moveInDate: "", leaseMonths: "6", notes: "" });
    setBookingFormError("");
    setBookingFormOpen(true);
  };

  const resetBookingForm = () => {
    setBookingProperty(null);
    setBookingForm({ moveInDate: "", leaseMonths: "6", notes: "" });
    setBookingFormError("");
    setBookingFormOpen(false);
  };

  const submitBooking = async event => {
    if (event) event.preventDefault();

    if (!user || user.role !== "tenant") {
      setAuthModal("tenant");
      return;
    }

    if (!bookingProperty) {
      setBookingFormError("Select a property before submitting a booking request.");
      return;
    }

    if (!bookingForm.moveInDate) {
      setBookingFormError("Please choose a move-in date.");
      return;
    }

    const leaseMonths = Number(bookingForm.leaseMonths);
    if (!Number.isInteger(leaseMonths) || leaseMonths < 1) {
      setBookingFormError("Lease duration must be at least 1 month.");
      return;
    }

    setBookingSubmitting(true);
    setBookingFormError("");

    try {
      await createBooking({
        propertyId: bookingProperty.id,
        moveInDate: bookingForm.moveInDate,
        leaseMonths,
        notes: bookingForm.notes.trim(),
      });
      msg("Request sent. The listing stays available until the landlord confirms an arrangement.", "ok");
      resetBookingForm();
      await refreshProperties();
    } catch (error) {
      setBookingFormError(error.response?.data?.message || error.message || "Unable to submit booking.");
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleTenantCancelBooking = async bookingId => {
    try {
      await cancelBooking(bookingId);
      msg("Booking cancelled successfully.", "ok");
      await refreshProperties();
    } catch (error) {
      msg(error.response?.data?.message || error.message || "Unable to cancel booking.", "err");
    }
  };

  const requestBookingCompletion = (booking, action) => {
    const labels = {
      REQUEST: {
        title: "Request booking completion",
        confirmLabel: "Send request",
        message: "The other party must confirm before this booking closes. The property stays taken until the booking is completed.",
      },
      CONFIRM: {
        title: "Confirm booking completion",
        confirmLabel: "Confirm completion",
        message: "This closes the booking after both parties confirm. The listing is marked available again if no other confirmed booking remains.",
      },
      WITHDRAW: {
        title: "Withdraw completion request",
        confirmLabel: "Withdraw request",
        message: "The booking will remain active, and the other party will no longer be able to confirm this request.",
      },
    };
    const prompt = labels[action];
    setConfModal({
      type: "completion",
      title: prompt.title,
      msg2: prompt.message,
      confirmLabel: prompt.confirmLabel,
      onConfirm: async () => {
        setConfModal(null);
        setCompletionLoadingId(booking.id);
        try {
          const updated = await updateBookingCompletion(booking.id, action);
          msg(updated.status === "COMPLETED"
            ? "Booking completed. Availability was updated if no other confirmed booking remains."
            : action === "WITHDRAW"
              ? "Completion request withdrawn."
              : "Completion request sent. The other party must confirm.");
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to update tenancy completion.", "err");
        } finally {
          setCompletionLoadingId("");
        }
      },
    });
  };

  const renderCompletionControls = booking => {
    if (booking.status !== "APPROVED") return null;
    if (["PENDING", "DISPUTED"].includes(booking.terminationRequestStatus)) return null;
    const role = String(user?.role || "").toUpperCase();
    const requester = booking.completionRequestedBy;
    const leaseEnd = leaseTermEndsAt(booking);
    if (!leaseEnd || APP_INITIALIZED_AT < leaseEnd.getTime()) {
      return (
        <>
          <span className="arow-meta" role="status">
            {requester ? "A completion request is pending, but it cannot be confirmed yet. " : ""}
            Completion becomes available after {leaseTermEndLabel(booking) || "the agreed lease end date"}. For an earlier end, use the early termination process.
          </span>
          {requester === role && (
            <button
              className="bghost"
              disabled={completionLoadingId === booking.id}
              onClick={() => requestBookingCompletion(booking, "WITHDRAW")}
            >
              Withdraw request
            </button>
          )}
        </>
      );
    }
    if (requester === role) {
      return (
        <>
          <span className="arow-meta" role="status">Waiting for the other party to confirm completion.</span>
          <button
            className="bghost"
            disabled={completionLoadingId === booking.id}
            onClick={() => requestBookingCompletion(booking, "WITHDRAW")}
          >
            Withdraw request
          </button>
        </>
      );
    }
    return (
      <>
        <button
          className={requester ? "bapp" : "bghost"}
          disabled={completionLoadingId === booking.id}
          onClick={() => requestBookingCompletion(booking, requester ? "CONFIRM" : "REQUEST")}
        >
          {completionLoadingId === booking.id
            ? "Updating…"
            : requester
              ? "Confirm completion"
              : "Request completion"}
        </button>
      </>
    );
  };

  const requestEarlyTerminationAction = (booking, action) => {
    const prompts = {
      REQUEST: {
        title: "Request early tenancy termination?",
        message: "Share a clear reason with the tenant. The tenancy remains active unless the tenant agrees or an admin resolves a dispute.",
        confirmLabel: "Send request",
      },
      AGREE: {
        title: "Agree to end the tenancy?",
        message: "This ends the active tenancy by mutual agreement. The listing becomes available only if no other active tenancy remains.",
        confirmLabel: "Agree and end tenancy",
      },
      DISPUTE: {
        title: "Ask an admin to review?",
        message: "The tenancy will remain active while an admin reviews the landlord’s early termination request.",
        confirmLabel: "Dispute request",
      },
      WITHDRAW: {
        title: "Withdraw early termination request?",
        message: "The request will close and the tenancy will remain active.",
        confirmLabel: "Withdraw request",
      },
    };
    const prompt = prompts[action];
    if (action === "REQUEST") setTerminationReason("");
    setConfModal({
      type: "completion",
      title: prompt.title,
      msg2: prompt.message,
      confirmLabel: prompt.confirmLabel,
      terminationAction: action,
      onConfirm: async () => {
        if (action === "REQUEST" && terminationReason.trim().length < 10) {
          msg("Please provide a reason of at least 10 characters.", "err");
          return;
        }
        setConfModal(null);
        setCompletionLoadingId(booking.id);
        try {
          const updated = await updateEarlyTermination(
            booking.id,
            action,
            action === "REQUEST" ? terminationReason.trim() : ""
          );
          msg(updated.status === "COMPLETED"
            ? "Tenancy ended by agreement. Availability was updated if no other active tenancy remains."
            : action === "REQUEST"
              ? "Early termination request sent to the tenant."
              : action === "DISPUTE"
                ? "The request is disputed and awaiting admin review."
                : action === "WITHDRAW"
                  ? "Early termination request withdrawn."
                  : "You agreed to end the tenancy.");
          await refreshProperties();
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to update early termination request.", "err");
        } finally {
          setCompletionLoadingId("");
        }
      },
    });
  };

  const renderTerminationControls = booking => {
    if (booking.status !== "APPROVED") return null;
    const requestStatus = booking.terminationRequestStatus || "NONE";
    const role = String(user?.role || "").toUpperCase();
    if (requestStatus === "PENDING") {
      if (role === "LANDLORD") {
        return <button className="bghost" disabled={completionLoadingId === booking.id} onClick={() => requestEarlyTerminationAction(booking, "WITHDRAW")}>Withdraw request</button>;
      }
      if (role === "TENANT") {
        return (
          <>
            <button className="bapp" disabled={completionLoadingId === booking.id} onClick={() => requestEarlyTerminationAction(booking, "AGREE")}>Agree to end tenancy</button>
            <button className="bdel" disabled={completionLoadingId === booking.id} onClick={() => requestEarlyTerminationAction(booking, "DISPUTE")}>Dispute request</button>
          </>
        );
      }
    }
    if (requestStatus === "DISPUTED") {
      return <span className="arow-meta" role="status">Disputed · awaiting admin review</span>;
    }
    if (role === "LANDLORD" && !booking.completionRequestedBy) {
      return <button className="bdel" disabled={completionLoadingId === booking.id} onClick={() => requestEarlyTerminationAction(booking, "REQUEST")}>Request early termination</button>;
    }
    return null;
  };

  useEffect(() => {
    if (!payModal?.paymentId || !payModal.hasStkPush || payModal.status !== "PENDING") return undefined;
    const timer = window.setInterval(() => {
      void refreshPropertyPaymentStatus();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [payModal?.paymentId, payModal?.hasStkPush, payModal?.status, refreshPropertyPaymentStatus]);

  const handleApproveBooking = async bookingId => {
    setBookingConflictId("");
    try {
      await approveBooking(bookingId);
      msg("Request confirmed; the property is now marked taken.", "ok");
      await refreshProperties();
    } catch (error) {
      const conflictId = error.response?.data?.data?.conflictingBooking?.id;
      if (error.response?.status === 409 && conflictId) {
        setBookingConflictId(conflictId);
        await loadLandlordBookings({ limit: 100 });
      }
      msg(error.response?.data?.message || error.message || "Unable to approve booking.", "err");
    }
  };

  const requestMarkTestBooking = booking => {
    setConfModal({
      type: "test-data",
      title: "Mark this booking as test data?",
      msg2: "This admin-only label is explicit and auditable. Completed bookings cannot be marked.",
      onConfirm: async () => {
        try {
          await markBookingAsTestData(booking.id);
          await loadAdminBookings(adminBookingsPagination?.page || 1);
          msg("Booking marked as test data.", "ok");
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to mark booking.", "err");
        } finally {
          setConfModal(null);
        }
      },
    });
  };

  const requestResolveBooking = booking => {
    setConfModal({
      type: "completion",
      title: "Resolve this booking and availability?",
      confirmLabel: "Close booking",
      msg2: "This admin action closes the active booking. The property is marked available only if no other confirmed booking remains. Use this after reviewing a dispute or verifying the tenancy has ended.",
      onConfirm: async () => {
        setConfModal(null);
        try {
          await resolveBookingAvailability(booking.id);
          await Promise.all([
            loadAdminBookings(adminBookingsPagination?.page || 1),
            refreshProperties(),
          ]);
          msg("Booking resolved. Availability changed only if no other confirmed booking remains.", "ok");
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to resolve booking availability.", "err");
        }
      },
    });
  };

  const requestResolveEarlyTermination = (booking, resolution) => {
    const endsTenancy = resolution === "END_TENANCY";
    setConfModal({
      type: "completion",
      title: endsTenancy ? "End this tenancy?" : "Keep this tenancy active?",
      confirmLabel: endsTenancy ? "End tenancy" : "Keep active",
      msg2: endsTenancy
        ? "This resolves the dispute in favor of ending the tenancy. The listing becomes available only if no other active tenancy remains."
        : "This closes the termination request. The tenancy remains active and the listing stays occupied.",
      onConfirm: async () => {
        setConfModal(null);
        setCompletionLoadingId(booking.id);
        try {
          await resolveEarlyTermination(booking.id, resolution);
          await Promise.all([
            loadAdminBookings(adminBookingsPagination?.page || 1),
            refreshProperties(),
          ]);
          msg(endsTenancy
            ? "Dispute resolved. Tenancy ended and availability updated if appropriate."
            : "Dispute resolved. The tenancy remains active.", "ok");
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to resolve early termination dispute.", "err");
        } finally {
          setCompletionLoadingId("");
        }
      },
    });
  };

  const requestCloseTestBooking = booking => {
    setConfModal({
      type: "close-test",
      title: "Close this test booking?",
      msg2: "The booking will be cancelled and the listing released if no other confirmed booking remains.",
      onConfirm: async () => {
        try {
          await closeTestBooking(booking.id);
          await loadAdminBookings(adminBookingsPagination?.page || 1);
          await refreshProperties();
          msg("Test booking closed.", "ok");
        } catch (error) {
          msg(error.response?.data?.message || error.message || "Unable to close test booking.", "err");
        } finally {
          setConfModal(null);
        }
      },
    });
  };

  const handleRejectBooking = async bookingId => {
    try {
      await rejectBooking(bookingId);
      msg("Booking rejected.", "ok");
      await refreshProperties();
    } catch (error) {
      msg(error.response?.data?.message || error.message || "Unable to reject booking.", "err");
    }
  };

  const postAnn = async () => {
    if(!annF.title||!annF.body){ msg("Fill all fields.","warn"); return; }
    if(dirty(annF.title)||dirty(annF.body)){ msg("❌ Inappropriate content.","err"); return; }
    setAnnLoading(true);
    try {
      await Promise.resolve();
      setAnns(l=>[{id:"A"+Date.now(),...annF,date:todayStr(),active:true},...l]);
      setAnnF({title:"",body:"",type:"success"});
      msg("✅ Announcement published!","ok");
    } finally {
      setAnnLoading(false);
    }
  };

  const adminPostListing = async () => {
    if(!admListF.title||!admListF.location||!admListF.rent){ msg("Fill required fields.","warn"); return; }
    if(dirtyObj(admListF)){ msg("❌ Inappropriate content.","err"); return; }
    setAdminListingLoading(true);
    try {
      const np = await addProperty(propertyPayload(admListF, admMedia));
      await approvePropertyApi(np.id, true);
      await featurePropertyApi(np.id, true);
      setAdmListF({title:"",location:"",rent:"",rooms:"",type:"Apartment",rules:"",tags:""});
      setAdmMedia([]);
      msg("✅ Admin listing live & boosted!","ok");
    } catch (error) {
      msg(error.response?.data?.message || error.message || "Unable to post listing.", "err");
    } finally {
      setAdminListingLoading(false);
    }
  };

  const liveProp = propertyId && selProp && String(selProp.id) === String(propertyId)
    ? selProp
    : null;
  const selectedLandlord = liveProp?.landlord ? {
    name: [liveProp.landlord.firstName, liveProp.landlord.lastName].filter(Boolean).join(" "),
    email: liveProp.landlord.email,
    phone: liveProp.landlord.phone,
    joined: liveProp.landlord.createdAt,
  } : (liveProp ? landlords.find(l=>l.id===liveProp.landlordId) : null);
  const canManage = liveProp && (user?.role==="admin"||(user?.role==="landlord"&&liveProp.landlordId===user?.data?.id));
  const activeAnns = anns.filter(a=>a.active);
  const activeTab = tab;
  const openProperty = property => {
    modalOpenerRef.current = document.activeElement;
    setSelProp(property);
    setMidx(0);
    if (!location.pathname.startsWith("/property/")) {
      navigate(`/property/${property.id}`, {
        state: { from: { pathname: location.pathname, search: location.search, hash: location.hash } },
      });
    }
  };

  useEffect(() => {
    if (liveProp) {
      document.body.style.overflow = "hidden";
      modalRef.current?.focus();
      return () => { document.body.style.overflow = ""; };
    }
    return undefined;
  }, [liveProp]);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {/* HEADER */}
      <Navbar
        tab={tab}
        setTab={setTab}
        favoritesCount={favorites.length}
        user={user}
        logout={logout}
        setAuthModal={setAuthModal}
        onChangePassword={() => {
          setPasswordError("");
          setPasswordSuccess("");
          setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
          setPasswordModalOpen(true);
        }}
      />

      {notFound ? (
        <main id="main-content" ref={mainRef} className="not-found-main">
          <NotFound />
        </main>
      ) : (
      <main id="main-content" ref={mainRef}>
      {tab !== "home" && <h1 className="sr-only" tabIndex={-1}>
        {tab === "guide" ? "How HouseHunt Kenya Works" : tab === "tenant" ? "Find a Home" : tab === "saved" ? "Saved Homes" : tab === "landlord" ? "Landlord Dashboard" : "Admin Dashboard"}
      </h1>}
      {/* ANN BAR */}
      {tenantAnnouncements.length>0 && tab!=="admin" && (
        <div className="annbar">
          {tenantAnnouncements.map(a=>(
            <div key={a.id} className={`anntag at-${a.type}`}>
              {a.type==="success" ? <Icon name="checkCircle" /> : a.type==="info" ? <Icon name="info" /> : <Icon name="alert" />} {a.title}: {a.body}
            </div>
          ))}
        </div>
      )}

      {announcementError && tab === "tenant" && (
        <div className="form-error" role="alert" style={{ margin: "1rem auto", maxWidth: 920 }}>
          Unable to load announcements: {announcementError}
        </div>
      )}

      {propertiesError && (
        <div className="form-error" role="alert" style={{ margin: "1rem auto", maxWidth: 920 }}>
          Unable to load properties: {propertiesError}
          <button type="button" className="bghost" style={{ marginLeft: "0.75rem" }} onClick={() => refreshProperties()}>Retry</button>
        </div>
      )}
      {paymentConfigError && <div className="form-error" role="alert" style={{ margin: "1rem auto", maxWidth: 920 }}>Unable to load M-PESA pricing: {paymentConfigError}</div>}
      {unlockedPropertiesError && user?.role === "tenant" && <div className="form-error" role="alert" style={{ margin: "1rem auto", maxWidth: 920 }}>Unable to load your unlocked properties: {unlockedPropertiesError}</div>}
      {propertyId && !propertiesLoading && !liveProp && !propertiesError && (
        <div className="page" role="alert"><div className="noresult"><h3>Property not found</h3><p>This listing is unavailable or no longer visible.</p></div></div>
      )}

      {/* ─── HOME ─── */}
      {activeTab==="home" && <>
        <Hero user={user} setTab={setTab} setAuthModal={setAuthModal} />
        <div className="statsbar">
          <div className="stitem"><span className="stnum">{propertiesLoading ? "…" : propertyPagination?.total ?? props.length}</span><span className="stlbl">Matching homes</span></div>
          <div className="stitem"><span className="stnum">{propertiesLoading ? "…" : props.filter(p=>p.status==="available"&&p.approved!==false).length}</span><span className="stlbl">Available on this page</span></div>
          <div className="stitem"><span className="stnum">KSh {Number(settings.unlockFee).toLocaleString()}</span><span className="stlbl">M-PESA contact unlock</span></div>
          <div className="stitem"><span className="stnum">Free</span><span className="stlbl">To browse listings</span></div>
        </div>
        <div className="home-trust" aria-label="Why use HouseHunt Kenya">
          <div className="trust-item"><Icon name="checkCircle" /><div><strong>Admin-reviewed listings</strong><span>Listings marked reviewed have passed admin approval</span></div></div>
          <div className="trust-item"><Icon name="phone" /><div><strong>Contact landlords directly</strong><span>Unlock contact details when you find a home</span></div></div>
          <div className="trust-item"><Icon name="creditCard" /><div><strong>Pay landlords directly</strong><span>Rent and deposits are arranged between tenant and landlord</span></div></div>
        </div>
        <div className="page">
          <div className="home-search-head">
            <div className="sh"><div className="shey">Browse homes</div><div className="shtt">Find your next home</div></div>
            <button className="bghost" onClick={clearPropertyFilters}>Clear filters</button>
          </div>
          <SearchBar
            search={search} setSearch={updateSearch}
            budget={budget} setBudget={updateBudget}
            ptype={ptype} setPtype={updatePropertyType}
            county={county} setCounty={updateCounty}
            town={town} setTown={updateTown}
            bedrooms={bedrooms} setBedrooms={updateBedrooms}
            amenities={amenities} toggleAmenity={updateAmenities}
            sort={sort} setSort={updateSort}
            onRemoveFilter={removePropertyFilter} onClearFilters={clearPropertyFilters}
            onSearch={() => document.getElementById("home-results")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          {propertiesLoading && <PropertySkeletons />}
          {!propertiesLoading && !propertiesError && <>
            {featuredProps.length > 0 && <>
              <div className="sh featured-heading"><div className="shey">Featured & Boosted</div><div className="shtt">A few places worth seeing</div></div>
              <PropertyGrid className="pgrid featured-grid" properties={featuredProps} onView={openProperty} user={user} onDel={deleteProp} favorites={favorites} onToggleFavorite={toggleFavorite} />
            </>}
            <div id="home-results" className="home-results-head">
              <div className="sh"><div className="shey">More listings</div><div className="shtt">Homes matching your search</div></div>
              <span className="result-count">{propertyPagination?.total ?? filtered.length} {(propertyPagination?.total ?? filtered.length) === 1 ? "home" : "homes"}</span>
            </div>
            {remainingProps.length === 0
              ? <div className="noresult"><h3>{filtered.length === 0 ? "No listings found" : "You are viewing all matching featured listings"}</h3><p>{filtered.length === 0 ? "Try adjusting your filters or clear the search to see all available homes." : "Try another search to discover more homes."}</p>{filtered.length === 0 && <button onClick={clearPropertyFilters}>Clear filters</button>}</div>
              : <PropertyGrid properties={remainingProps} onView={openProperty} user={user} onDel={deleteProp} favorites={favorites} onToggleFavorite={toggleFavorite} />}
            <PropertyPagination pagination={propertyPagination} loading={propertiesLoading} onPageChange={setPropertyPage} />
          </>}
        </div>
      </>}

      {/* ─── TENANT BROWSE ─── */}
      {activeTab==="tenant" && (
        <div className="page">
          {!user && <div className="guestbanner"><p><strong><Icon name="unlock" /> Guest browsing.</strong> Browse homes freely. Login only when you want to unlock landlord contacts.</p><button className="bp" style={{fontSize:"0.78rem",padding:"7px 16px"}} onClick={()=>setAuthModal("tenant")}>Login / Sign Up Free</button></div>}
          {user && (
            <>
              <div className="thdr">
                <div>
                  <div className="shey">Tenant Dashboard</div>
                  <div className="shtt">Your home search, unlocks and latest activity</div>
                </div>
                <button className="bp" style={{height:"42px"}} onClick={clearPropertyFilters}>Clear filters</button>
              </div>
              <div className="tkpis">
                <div className="tkpi">
                  <div className="tkpi-label">Welcome back</div>
                  <strong>{tenantFirstName}</strong>
                  <div className="tkpi-note">Browse homes, unlock contacts, and move faster.</div>
                </div>
                <div className="tkpi">
                  <div className="tkpi-label">Unlocked contacts</div>
                  <strong>{tenantUnlockedProps.length}</strong>
                  <div className="tkpi-note">{tenantUnlockedProps.length ? `${tenantUnlockedProps.length} listing${tenantUnlockedProps.length > 1 ? "s" : ""} unlocked` : "Unlock a listing to reveal contact details."}</div>
                </div>
                <div className="tkpi">
                  <div className="tkpi-label">Homes matching filters</div>
                  <strong>{propertyPagination?.total ?? filtered.length}</strong>
                  <div className="tkpi-note">{filtered.filter(p=>p.status==="available").length} available on this page.</div>
                </div>
              </div>
              {tenantUnlockedProps.length > 0 ? (
                <div className="tunlock">
                  <div className="tunlock-head">
                    <div>
                      <h3>Unlocked contacts</h3>
                      <p>Review your unlocked homes and quickly jump back to landlord contact details.</p>
                    </div>
                    <div className="tunlock-meta">{KES(unlockedRent)} total rent</div>
                  </div>
                  <div className="tunlock-grid">
                    {tenantUnlockedProps.map(p=>(
                      <div key={p.id} className="tunlock-card">
                        <div className="tunlock-title">{p.title}</div>
                        <div className="tunlock-meta"><Icon name="mapPin" /> {p.location}</div>
                        <div className="tunlock-short">{p.rooms} · {p.type}</div>
                        <div className="tunlock-actions">
                          <span className={`sbadge sb-${p.status==="available"?"av":"tk"}`}>{p.status==="available"?"Available":"Taken"}</span>
                          <span className="tunlock-rent">{KES(p.rent)}/mo</span>
                        </div>
                        <button className="bp" style={{width:"100%",marginTop:"0.8rem"}} onClick={()=>openProperty(p)}>View Details</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="tbanner">
                    <strong>No unlocked contacts yet.</strong> Browse listings freely, then unlock landlord contact details with a one-time M-PESA payment.
                </div>
              )}

              <div className="fcard" style={{marginTop:"1.5rem"}}>
                <h3>My Bookings</h3>
                <p className="sub">A request records interest. The listing stays available until the landlord confirms an arrangement and marks it taken. Rent and deposits are arranged directly with the landlord.</p>
                {tenantLoading && <EmptyState role="status">Loading bookings…</EmptyState>}
                {!tenantLoading && tenantError && <div className="form-error" role="alert">{tenantError}</div>}
                {!tenantLoading && !tenantError && tenantBookings.length === 0 && (
                  <EmptyState>No bookings yet.</EmptyState>
                )}
                {!tenantLoading && !tenantError && tenantBookings.length > 0 && (
                  <div style={{display:"grid",gap:"0.85rem"}}>
                    {tenantBookings.map(booking => (
                      <div key={booking.id} className="arow" style={{borderLeft:"3px solid rgba(196,153,26,0.7)"}}>
                        <div className="arow-icon" style={{background:"#B5451B"}}>{(booking.property?.title || "B").slice(0,1).toUpperCase()}</div>
                        <div className="arow-info">
                          <div className="arow-title">{booking.property?.title || "Property booking"}</div>
                          <div className="arow-meta">📍 {bookingLocation(booking.property?.location) || "Location not available"} · Move-in {booking.moveInDate ? new Date(booking.moveInDate).toLocaleDateString("en-KE") : "N/A"} · {booking.leaseMonths || 0} month{(booking.leaseMonths || 0) === 1 ? "" : "s"}</div>
                          <div className="booking-journey" aria-label={`Request status: ${bookingStatusLabel(booking.status)}`}>
                            {["Request sent", "Landlord confirms & marks taken"].map((step, index) => {
                              const activeStep = booking.status === "PENDING" ? 0
                                : booking.status === "APPROVED" ? 1 : -1;
                              return <span key={step} className={index <= activeStep ? "complete" : ""}>{step}</span>;
                            })}
                          </div>
                          {booking.status === "APPROVED" && <div className="arow-meta">The listing is marked taken. Coordinate next steps directly with the landlord.</div>}
                          {booking.terminationRequestStatus === "PENDING" && (
                            <div className="arow-meta" role="status">
                              Landlord requested early termination: {booking.terminationReason}
                            </div>
                          )}
                          {booking.terminationRequestStatus === "DISPUTED" && (
                            <div className="arow-meta" role="status">Your dispute is awaiting admin review. The tenancy remains active.</div>
                          )}
                          {booking.terminationRequestStatus === "RESOLVED" && booking.terminationResolution === "KEEP_ACTIVE" && (
                            <div className="arow-meta">Admin reviewed the request; this tenancy remains active.</div>
                          )}
                          {["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status) && (
                            <div className="arow-meta">
                              {booking.status === "COMPLETED"
                                ? "You’ve completed this tenancy."
                                : booking.status === "CANCELLED"
                                  ? "This request was cancelled."
                                  : "This request wasn’t approved."}
                            </div>
                          )}
                        </div>
                        <div className="arow-acts">
                          <span className={`sbadge ${bookingStatusTone(booking.status)}`}>{bookingStatusLabel(booking.status)}</span>
                          {renderCompletionControls(booking)}
                          {renderTerminationControls(booking)}
                          {booking.status === "PENDING" && (
                            <button className="bdel" onClick={()=>handleTenantCancelBooking(booking.id)}>Cancel</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}
          <div className="sh"><div className="shey">Browse listings</div><div className="shtt">Find Your Home</div></div>
          <SearchBar
            search={search} setSearch={updateSearch}
            budget={budget} setBudget={updateBudget}
            ptype={ptype} setPtype={updatePropertyType}
            county={county} setCounty={updateCounty}
            town={town} setTown={updateTown}
            bedrooms={bedrooms} setBedrooms={updateBedrooms}
            amenities={amenities} toggleAmenity={updateAmenities}
            sort={sort} setSort={updateSort}
            onRemoveFilter={removePropertyFilter} onClearFilters={clearPropertyFilters}
          />
          {propertiesLoading
            ? <PropertySkeletons />
            : propertiesError
            ? <div className="form-error" role="alert">Unable to load tenant properties: {propertiesError} <button type="button" className="bghost" onClick={refreshProperties}>Retry</button></div>
            : filtered.length===0
            ? <div className="noresult"><h3>No listings found</h3><p>There are no homes matching these filters right now.</p><div className="empty-actions"><button onClick={clearPropertyFilters}>Clear filters</button><button onClick={() => { clearPropertyFilters(); setTab("home"); }}>Browse all homes</button></div></div>
            : <PropertyGrid
                properties={filtered}
                onView={openProperty}
                user={user}
                onDel={deleteProp}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />}
          <PropertyPagination pagination={propertyPagination} loading={propertiesLoading} onPageChange={setPropertyPage} />
        </div>
      )}

      {activeTab==="saved" && (
        <SavedHomes
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onView={openProperty}
          onBrowse={() => setTab("home")}
          user={user}
          loadingSavedHomes={savedHomesLoading}
          savedHomesError={savedHomesError}
          onRetrySavedHomes={retrySavedHomes}
          onClearSavedHomes={clearSavedHomesRequest}
          onSignIn={() => setAuthModal("tenant")}
        />
      )}

      {/* ─── LANDLORD DASHBOARD ─── */}
          {activeTab==="landlord" && user?.role==="landlord" && propertiesLoading && props.length===0 && (
            <div className="page"><PropertySkeletons /></div>
          )}
          {activeTab==="landlord" && user?.role==="landlord" && propertiesError && !propertiesLoading && props.length===0 && (
            <div className="page"><div className="form-error" role="alert">Unable to load your listings: {propertiesError}<button type="button" className="bghost" style={{marginLeft:"0.75rem"}} onClick={refreshProperties}>Retry</button></div></div>
          )}
          {activeTab==="landlord" && user?.role==="landlord" && (!propertiesLoading || props.length>0) && (!propertiesError || props.length>0) && (
        <div className="page">
          <div className="sh"><div className="shey">Property Owner</div><div className="shtt">Landlord Dashboard</div></div>
          <div className="ldashboard-top">
            <div className="lhero-card">
              <div>
                <div className="lhero-title">Welcome back, {landFirstName}</div>
                <p>Manage your portfolio, monitor listing performance, and keep tenant leads moving.</p>
              </div>
              <div className="lhero-actions">
                <button type="button" className="bghost" onClick={()=>{setLdTab("listing");document.getElementById("landlord-dashboard-workspace")?.scrollIntoView({behavior:"smooth",block:"start"});}}>Add a listing</button>
                <button type="button" className="bghost" onClick={()=>document.getElementById("landlord-active-tenancies")?.scrollIntoView({behavior:"smooth",block:"start"})}>Review active tenancies</button>
              </div>
            </div>
            <div className="lkpis">
              <div className="lkpi"><span>{myProps.length}</span><strong>Listings</strong></div>
              <div className="lkpi"><span className="lkpi-stat grn">{myAvailable.length}</span><strong>Available</strong></div>
              <div className="lkpi"><span className="lkpi-stat red">{myTaken.length}</span><strong>Taken</strong></div>
              <div className="lkpi"><span className="lkpi-stat amber">{myBoosted.length}</span><strong>Boosted</strong></div>
              <div className="lkpi"><span className="lkpi-stat pd">{myPending.length}</span><strong>Pending Review</strong></div>
            </div>
          </div>

          <section className="landlord-priority" aria-labelledby="landlord-priority-heading">
            <div className="landlord-priority-heading">
              <div>
                <h3 id="landlord-priority-heading">Priority actions</h3>
                <p>Stay current and make each listing easier for tenants to assess.</p>
              </div>
              <span>Availability check due every 30 days · Boost reminder within 7 days of expiry</span>
            </div>
            <div className="landlord-priority-grid">
              <article className="landlord-priority-card">
                <div className="landlord-priority-card-head">
                  <div><h4>Availability checks</h4><strong>{myAvailabilityDue.length}</strong></div>
                  <span aria-hidden="true">↻</span>
                </div>
                <p>Confirm available listings that have never been checked or are due for an update.</p>
                {myAvailabilityDue.length > 0 ? (
                  <ul>{myAvailabilityDue.slice(0, 3).map(property => (
                    <li key={property.id}>
                      <span>{property.title}</span>
                      <button type="button" className="landlord-priority-link" onClick={()=>void confirmAvailability(property.id)} disabled={availabilityConfirmingId === property.id} aria-busy={availabilityConfirmingId === property.id}>
                        {availabilityConfirmingId === property.id ? "Confirming…" : "Confirm"}
                      </button>
                    </li>
                  ))}</ul>
                ) : <p className="landlord-priority-empty">All approved available listings are up to date.</p>}
                {myAvailabilityDue.length > 3 && <p className="landlord-priority-more">And {myAvailabilityDue.length - 3} more in My Listings.</p>}
              </article>

              <article className="landlord-priority-card">
                <div className="landlord-priority-card-head">
                  <div><h4>Complete listing details</h4><strong>{myListingsNeedingDetails.length}</strong></div>
                  <span aria-hidden="true">✎</span>
                </div>
                <p>Listings with short descriptions, no photos, or no estate/neighbourhood details.</p>
                {myListingsNeedingDetails.length > 0 ? (
                  <ul>{myListingsNeedingDetails.slice(0, 3).map(({ property, missingDetails }) => (
                    <li key={property.id}>
                      <span>{property.title}<small>{missingDetails.join(" · ")}</small></span>
                      <button type="button" className="landlord-priority-link" onClick={()=>{beginEditProperty(property);document.getElementById("landlord-dashboard-workspace")?.scrollIntoView({behavior:"smooth",block:"start"});}}>Edit</button>
                    </li>
                  ))}</ul>
                ) : <p className="landlord-priority-empty">Your listings have the key details tenants need.</p>}
                {myListingsNeedingDetails.length > 3 && <p className="landlord-priority-more">And {myListingsNeedingDetails.length - 3} more in My Listings.</p>}
              </article>

              <article className="landlord-priority-card">
                <div className="landlord-priority-card-head">
                  <div><h4>Boosts ending soon</h4><strong>{myBoostsExpiring.length}</strong></div>
                  <span aria-hidden="true">★</span>
                </div>
                <p>Review boosted listings with seven days or less remaining.</p>
                {myBoostsExpiring.length > 0 ? (
                  <ul>{myBoostsExpiring.slice(0, 3).map(property => (
                    <li key={property.id}>
                      <span>{property.title}<small>Ends {new Date(property.featuredUntil).toLocaleDateString("en-KE")}</small></span>
                      <button type="button" className="landlord-priority-link" onClick={()=>void openPropertyPayment({type:"boost",propId:property.id})}>Renew</button>
                    </li>
                  ))}</ul>
                ) : <p className="landlord-priority-empty">No boosts are ending in the next seven days.</p>}
                {myBoostsExpiring.length > 3 && <p className="landlord-priority-more">And {myBoostsExpiring.length - 3} more in My Listings.</p>}
              </article>
            </div>
          </section>

          <div id="landlord-active-tenancies" className="fcard landlord-active-tenancies" style={{marginBottom:"1.5rem"}}>
            <h3>Active Tenancies</h3>
            <p className="sub">Manage confirmed tenancies here. Request early termination only when needed; the tenant can agree or ask an admin to review.</p>
            {activeTenancyLoading && <EmptyState role="status">Loading active tenancies…</EmptyState>}
            {!activeTenancyLoading && activeTenancyError && (
              <div className="form-error" role="alert">
                Unable to load active tenancies: {activeTenancyError}
                <button type="button" className="bghost" style={{marginLeft:"0.75rem"}} onClick={() => void loadActiveLandlordBookings()}>Retry</button>
              </div>
            )}
            {!activeTenancyLoading && !activeTenancyError && activeLandlordBookings.length === 0 && (
              <EmptyState>No active confirmed tenancies.</EmptyState>
            )}
            {!activeTenancyLoading && !activeTenancyError && activeLandlordBookings.length > 0 && (
              <div style={{display:"grid",gap:"0.85rem"}}>
                {activeLandlordBookings.map(booking => (
                  <div key={booking.id} className="arow landlord-active-tenancy">
                    <div className="arow-icon" style={{background:"#2D5016"}}>{(booking.tenant?.firstName || "T").slice(0,1).toUpperCase()}</div>
                    <div className="arow-info">
                      <div className="arow-title">{booking.tenant?.firstName && booking.tenant?.lastName ? `${booking.tenant.firstName} ${booking.tenant.lastName}` : "Tenant"} · {booking.property?.title || "Property"}</div>
                      <div className="arow-meta">Move-in {booking.moveInDate ? new Date(booking.moveInDate).toLocaleDateString("en-KE") : "N/A"} · {booking.leaseMonths || 0} month{(booking.leaseMonths || 0) === 1 ? "" : "s"}</div>
                      {booking.terminationRequestStatus === "PENDING" && <div className="arow-meta" role="status">Early termination request sent. Reason: {booking.terminationReason}</div>}
                      {booking.terminationRequestStatus === "DISPUTED" && <div className="arow-meta" role="status">The tenant disputed this request. An admin must review it; the tenancy remains active.</div>}
                    </div>
                    <div className="arow-acts">
                      {renderCompletionControls(booking)}
                      {renderTerminationControls(booking)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div id="landlord-booking-requests" className="fcard landlord-booking-requests" style={{marginBottom:"1.5rem"}}>
            <h3>Booking Requests</h3>
            <p className="sub">Manage tenant requests for properties you own.</p>
            {bookingConflictId && (
              <div className="form-error booking-conflict" role="alert">
                This property already has an approved booking. The existing booking is still active.
                <button
                  type="button"
                  className="bghost"
                  onClick={() => document.getElementById(`booking-${bookingConflictId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                >
                  View its status
                </button>
              </div>
            )}
            {landlordLoading && <EmptyState role="status">Loading booking requests…</EmptyState>}
            {!landlordLoading && landlordError && <div className="form-error" role="alert">{landlordError}</div>}
            {!landlordLoading && !landlordError && landlordBookings.length === 0 && (
              <EmptyState>No booking requests yet.</EmptyState>
            )}
            {!landlordLoading && !landlordError && landlordBookings.length > 0 && (
              <div style={{display:"grid",gap:"0.85rem"}}>
                {landlordBookings.map(booking => (
                  <div id={`booking-${booking.id}`} key={booking.id} className="arow" style={{borderLeft:"3px solid rgba(39, 108, 68, 0.75)"}}>
                    <div className="arow-icon" style={{background:"#2D5016"}}>{(booking.tenant?.firstName || booking.tenant?.name || "T").slice(0,1).toUpperCase()}</div>
                    <div className="arow-info">
                      <div className="arow-title">{booking.tenant?.firstName && booking.tenant?.lastName ? `${booking.tenant.firstName} ${booking.tenant.lastName}` : booking.tenant?.name || "Tenant"} · {booking.property?.title || "Property"}</div>
                      <div className="arow-meta"><Icon name="mapPin" /> {bookingLocation(booking.property?.location) || "Location not available"} · Move-in {booking.moveInDate ? new Date(booking.moveInDate).toLocaleDateString("en-KE") : "N/A"} · {booking.leaseMonths || 0} month{(booking.leaseMonths || 0) === 1 ? "" : "s"}</div>
                      {booking.notes && <div className="arow-meta"><Icon name="briefcase" /> {booking.notes}</div>}
                      {booking.terminationRequestStatus === "PENDING" && (
                        <div className="arow-meta" role="status">Early termination request sent. Reason: {booking.terminationReason}</div>
                      )}
                      {booking.terminationRequestStatus === "DISPUTED" && (
                        <div className="arow-meta" role="status">The tenant disputed this request. An admin must review it; the tenancy remains active.</div>
                      )}
                    </div>
                    <div className="arow-acts">
                      <span className={`sbadge ${bookingStatusTone(booking.status)}`}>{bookingStatusLabel(booking.status)}</span>
                      {booking.status === "PENDING" && (
                        <>
                          <button className="bapp" onClick={()=>handleApproveBooking(booking.id)}>Confirm arrangement · mark taken</button>
                          <button className="bdel" onClick={()=>handleRejectBooking(booking.id)}>Reject</button>
                        </>
                      )}
                      {booking.status === "APPROVED" && (
                        <span className="arow-meta">Manage this tenancy in Active Tenancies above.</span>
                      )}
                      {booking.status === "COMPLETED" && (
                        <span className="arow-meta">Booking closed. Mark the listing available when it is vacant.</span>
                      )}
                    </div>
                  </div>
                ))}
                <Pagination
                  pagination={landlordBookingsPagination}
                  loading={landlordLoading}
                  onPageChange={page => void loadLandlordBookings({ page })}
                  ariaLabel="Booking request pages"
                  totalLabel="bookings"
                  className="arow-acts"
                  summaryClassName="arow-meta"
                  style={{justifyContent:"space-between",marginTop:"1rem"}}
                />
              </div>
            )}
          </div>
          <div id="landlord-dashboard-workspace" className="dlayout">
            <div className="dside">
              <div className="dshead">
                <div className="dav">{user.data.name[0]}</div>
                <div className="duname">{user.data.name}</div>
                <div className="durole">Property Owner</div>
              </div>
              <nav className="dsnav" aria-label="Landlord dashboard">
                {[["profile","👤","My Profile"],["social","📱","Contact & Socials"],["media","🖼️","Upload Media"],["listing","🏠","Add Listing"],["mylistings","📋","My Listings"]].map(([k,ic,lb])=>(
                  <button key={k} type="button" className={`snb${ldTab===k?" on":""}`} aria-current={ldTab===k?"page":undefined} onClick={()=>setLdTab(k)}>
                    <span className="snbi">{ic}</span>{lb}
                    {k==="mylistings"&&myProps.length>0&&<span className="snbc">{myProps.length}</span>}
                  </button>
                ))}
              </nav>
            </div>
            <div>
              {ldTab==="profile" && <form className="fcard" onSubmit={event=>{event.preventDefault();void saveProfile();}}>
                <h3>My Profile</h3><p className="sub">Your public display name on all listings.</p>
                <div className="frow">
                  <div className="fg"><label htmlFor="profile-first-name">First Name</label><input id="profile-first-name" value={profileForm.firstName} onChange={e=>setProfileForm({...profileForm,firstName:e.target.value})} disabled={profileSaving} /></div>
                  <div className="fg"><label htmlFor="profile-last-name">Last Name</label><input id="profile-last-name" value={profileForm.lastName} onChange={e=>setProfileForm({...profileForm,lastName:e.target.value})} disabled={profileSaving} /></div>
                </div>
                <div className="fg"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})} disabled={profileSaving} /></div>
                <button type="submit" className="bp" disabled={profileSaving} aria-busy={profileSaving}>{profileSaving ? "Saving profile…" : "Save Profile →"}</button>
              </form>}

              {adTab==="test-bookings" && <div className="atab">
                <h3>Booking & availability administration</h3>
                <p className="sub">Requests do not reserve a property. A landlord confirmation marks it taken; rent and deposits stay between landlord and tenant. Resolve disputed availability here when needed.</p>
                <button className="bghost" type="button" onClick={() => void loadAdminBookings(adminBookingsPagination?.page || 1)} disabled={adminBookingsLoading}>
                  {adminBookingsLoading ? "Loading…" : "Refresh bookings"}
                </button>
                {adminBookingsError && <div className="form-error" role="alert">{adminBookingsError}</div>}
                {adminBookingsLoading && <EmptyState role="status">Loading bookings…</EmptyState>}
                {!adminBookingsLoading && !adminBookingsError && adminBookings.length === 0 && <EmptyState>No bookings found.</EmptyState>}
                {!adminBookingsLoading && adminBookings.map(booking => (
                  <div key={booking.id} className="arow">
                    <div className="arow-info">
                      <div className="arow-title">{booking.property?.title || "Property booking"}</div>
                      <div className="arow-meta">Booking {booking.id} · {bookingStatusLabel(booking.status)}</div>
                      {booking.terminationRequestStatus === "DISPUTED" && (
                        <div className="arow-meta">Early termination dispute · Reason: {booking.terminationReason}</div>
                      )}
                      {booking.isTestData && <div className="arow-meta">Explicitly marked as test data</div>}
                    </div>
                    <div className="arow-acts">
                      {booking.status === "APPROVED" && !["PENDING", "DISPUTED"].includes(booking.terminationRequestStatus) && <button className="bban" onClick={() => requestResolveBooking(booking)}>Resolve booking</button>}
                      {booking.status === "APPROVED" && booking.terminationRequestStatus === "DISPUTED" && (
                        <>
                          <button className="bdel" disabled={completionLoadingId === booking.id} onClick={() => requestResolveEarlyTermination(booking, "END_TENANCY")}>End tenancy</button>
                          <button className="bapp" disabled={completionLoadingId === booking.id} onClick={() => requestResolveEarlyTermination(booking, "KEEP_ACTIVE")}>Keep active</button>
                        </>
                      )}
                      {booking.isTestData
                        ? <button className="bdel" disabled={booking.status !== "PENDING" && booking.status !== "APPROVED"} onClick={() => requestCloseTestBooking(booking)}>Close test booking</button>
                        : <button className="bapp" disabled={booking.status === "COMPLETED"} onClick={() => requestMarkTestBooking(booking)}>Mark as test data</button>}
                    </div>
                  </div>
                ))}
                <Pagination
                  pagination={adminBookingsPagination}
                  loading={adminBookingsLoading}
                  onPageChange={page => void loadAdminBookings(page)}
                  ariaLabel="Booking pages"
                  totalLabel="bookings"
                  className="arow-acts"
                  summaryClassName="arow-meta"
                  style={{justifyContent:"space-between",marginTop:"1rem"}}
                />
              </div>}

              {ldTab==="social" && <form className="fcard" onSubmit={event=>{event.preventDefault();void saveProfile();}}>
                <h3>Contact & Social Media</h3><p className="sub">Shown on listings so tenants can reach you directly.</p>
                <div className="divlbl"><span>📞 Phone Numbers</span></div>
                <div className="frow">
                  <div className="fg"><label htmlFor="social-phone">Primary Phone</label><div className="inpw"><span className="inpx">🇰🇪</span><input id="social-phone" placeholder="e.g. +254 700 000 000" value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})} disabled={profileSaving} /></div></div>
                  <div className="fg"><label htmlFor="social-whatsapp">WhatsApp</label><div className="inpw"><span className="inpx">💬</span><input id="social-whatsapp" placeholder="e.g. +254 700 000 000" value={profileForm.whatsapp} onChange={e=>setProfileForm({...profileForm,whatsapp:e.target.value})} disabled={profileSaving} /></div></div>
                </div>
                <div className="fg"><label htmlFor="social-email">Email <small>(account email)</small></label><div className="inpw"><span className="inpx">✉️</span><input id="social-email" type="email" value={user.data.email||""} readOnly /></div></div>
                <div className="divlbl"><span>📱 Social Media</span></div>
                <div className="frow">
                  <div className="fg"><label htmlFor="social-instagram">Instagram</label><div className="inpw"><span className="inpx">📸 @</span><input id="social-instagram" placeholder="username" value={profileForm.ig} onChange={e=>setProfileForm({...profileForm,ig:e.target.value})} disabled={profileSaving} /></div></div>
                  <div className="fg"><label htmlFor="social-facebook">Facebook</label><div className="inpw"><span className="inpx">👍</span><input id="social-facebook" placeholder="username" value={profileForm.fb} onChange={e=>setProfileForm({...profileForm,fb:e.target.value})} disabled={profileSaving} /></div></div>
                </div>
                <div className="frow">
                  <div className="fg"><label htmlFor="social-tiktok">TikTok</label><div className="inpw"><span className="inpx">🎵 @</span><input id="social-tiktok" placeholder="username" value={profileForm.tt} onChange={e=>setProfileForm({...profileForm,tt:e.target.value})} disabled={profileSaving} /></div></div>
                  <div className="fg"><label htmlFor="social-twitter">X / Twitter</label><div className="inpw"><span className="inpx">𝕏 @</span><input id="social-twitter" placeholder="username" value={profileForm.tw} onChange={e=>setProfileForm({...profileForm,tw:e.target.value})} disabled={profileSaving} /></div></div>
                </div>
                {(profileForm.phone||profileForm.whatsapp||profileForm.ig||profileForm.fb||profileForm.tt||profileForm.tw||user.data.email) && <div className="pprev"><h4>Live Preview</h4>
                  <div className="cchips">
                    {profileForm.phone&&<div className="cchip">📞 {profileForm.phone}</div>}
                    {profileForm.whatsapp&&<div className="cchip">💬 WhatsApp</div>}
                    {user.data.email&&<div className="cchip">✉️ {user.data.email}</div>}
                  </div>
                  <div className="schips">
                    {profileForm.ig&&<span className="sc sc-ig">📸 @{profileForm.ig.replace(/^@/, "")}</span>}
                    {profileForm.fb&&<span className="sc sc-fb">👍 {profileForm.fb.replace(/^@/, "")}</span>}
                    {profileForm.tt&&<span className="sc sc-tt">🎵 @{profileForm.tt.replace(/^@/, "")}</span>}
                    {profileForm.tw&&<span className="sc sc-tw">𝕏 @{profileForm.tw.replace(/^@/, "")}</span>}
                  </div>
                </div>}
                <button type="submit" className="bp" disabled={profileSaving} aria-busy={profileSaving}>{profileSaving ? "Saving contact details…" : "Save Contact Details →"}</button>
              </form>}

              {ldTab==="media" && <div className="fcard">
                <h3>Upload Photos & Videos</h3><p className="sub">Photos and videos are optimized automatically when you save the listing. Upload up to 20 files, maximum 50 MB each.</p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" multiple style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value="";}}/>
                <div className={`upzone${dragOv?" ov":""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Choose photos and videos to upload"
                  onClick={()=>fileRef.current.click()}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileRef.current.click();
                    }
                  }}
                  onDragOver={e=>{e.preventDefault();setDragOv(true);}}
                  onDragLeave={()=>setDragOv(false)}
                  onDrop={e=>{e.preventDefault();setDragOv(false);handleFiles(e.dataTransfer.files);}}>
                  <div className="upicon">📷</div><h4>Drag & Drop or Click to Upload</h4><p>Photos and short video tours</p>
                  <div className="uptypes">{["JPG","PNG","WEBP","AVIF","MP4","WEBM","MOV","Max 50MB"].map(t=><span key={t} className="utb">{t}</span>)}</div>
                </div>
                {pendMedia.length>0 && <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"1rem"}}>
                    <p style={{fontWeight:600,fontSize:"0.84rem"}}>{pendMedia.length} file{pendMedia.length>1?"s":""} {pendMedia.some(item=>item.file)?"ready to upload":"uploaded"}</p>
                    <button type="button" style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"0.74rem",fontWeight:700,fontFamily:"Inter,sans-serif"}} onClick={()=>{releaseMediaPreviews(pendMedia);setPendMedia([]);}}>Clear all</button>
                  </div>
                  <div className="mgrid">{pendMedia.map((m,i)=>(
                    <div key={i} className="mitem">
                      {m.type==="image"?<img src={m.url} alt=""/>:<video src={m.url} muted loop/>}
                      <button type="button" className="mrm" aria-label={`Remove uploaded media ${i + 1}`} onClick={()=>{releaseMediaPreviews([m]);setPendMedia(l=>l.filter((_,j)=>j!==i));}}>✕</button>
                      <span className="mtlbl">{m.type==="video"?"🎬":"📸"}</span>
                    </div>
                  ))}</div>
                </>}
              </div>}

              {ldTab==="listing" && <form className="fcard" onSubmit={event=>{event.preventDefault();void addProp();}}>
                <h3>{editingProperty ? "Edit Listing" : "Add New Listing"}</h3>
                <p className="sub">Free to post. New listings are reviewed before going live. {pendMedia.length>0 && `${pendMedia.length} media file(s) ready.`}</p>
                {formError && <div className="form-error" role="alert">{formError}</div>}
                {cwarn && <div className="cwarn"><p>⚠️ Your content contains inappropriate language. Please revise before submitting.</p></div>}
                <div className="frow">
                  <div className={`fg${formInvalid.title?" invalid":""}`}><label htmlFor="listing-title">Property Title *</label><input id="listing-title" placeholder="e.g. 2 Bedroom in Westlands" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setCwarn(false);setFormInvalid({...formInvalid,title:false});setFormError("");}} disabled={propLoading} aria-invalid={Boolean(formInvalid.title)}/></div>
                  <div className={`fg${formInvalid.location?" invalid":""}`}><label htmlFor="listing-location">Location *</label><input id="listing-location" placeholder="Westlands, Nairobi" value={form.location} onChange={e=>{setForm({...form,location:e.target.value});setFormInvalid({...formInvalid,location:false});setFormError("");}} disabled={propLoading} aria-invalid={Boolean(formInvalid.location)}/></div>
                </div>
                <div className="frow">
                  <div className={`fg${formInvalid.rent?" invalid":""}`}><label htmlFor="listing-rent">Monthly Rent (KES) *</label><input id="listing-rent" type="number" placeholder="25000" value={form.rent} onChange={e=>{setForm({...form,rent:e.target.value});setFormInvalid({...formInvalid,rent:false});setFormError("");}} disabled={propLoading} aria-invalid={Boolean(formInvalid.rent)}/></div>
                  <div className="fg"><label htmlFor="listing-type">Property Type</label><select id="listing-type" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} disabled={propLoading}>{["Bedsitter","Room","Apartment","House","Penthouse"].map(t=><option key={t}>{t}</option>)}</select></div>
                </div>
                <div className="fg"><label htmlFor="listing-rooms">Bedrooms & Facilities</label><input id="listing-rooms" placeholder="2 Bed · 1 Bath · DSQ" value={form.rooms} onChange={e=>setForm({...form,rooms:e.target.value})} disabled={propLoading}/></div>
                <fieldset className="listing-amenities" disabled={propLoading}>
                  <legend>Property amenities</legend>
                  <p>Select the features available at this property.</p>
                  <div className="listing-amenity-options">
                    {amenityOptions.map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={Boolean(form.amenities?.[key])}
                          onChange={event => setForm(current => ({
                            ...current,
                            amenities: { ...current.amenities, [key]: event.target.checked },
                          }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="fg"><label htmlFor="listing-rules">House Rules</label><textarea id="listing-rules" placeholder="No pets. 2 months deposit." value={form.rules} onChange={e=>{setForm({...form,rules:e.target.value});setCwarn(false);}} disabled={propLoading}/></div>
                {pendMedia.length>0 && <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>{pendMedia.slice(0,5).map((m,i)=>(
                  <div key={i} style={{width:50,height:38,borderRadius:6,overflow:"hidden",border:"1px solid rgba(181,69,27,0.18)"}}>
                    {m.type==="image"?<img src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}} muted/>}
                  </div>
                ))}{pendMedia.length>5&&<div style={{width:50,height:38,borderRadius:6,background:"rgba(10,10,24,0.07)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.68rem",color:"#bbb"}}>+{pendMedia.length-5}</div>}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button type="submit" className="bp" style={{flex:1,padding:"12px"}} disabled={propLoading} aria-busy={propLoading}>{propLoading ? pendMedia.some(item=>item.file) ? "Uploading media & saving…" : "Saving…" : editingProperty ? "Save Listing →" : "Post Listing Free →"}</button>
                  {editingProperty && <button type="button" className="bghost" onClick={()=>{releaseMediaPreviews(pendMedia);setEditingProperty(null);setForm(emptyPropertyForm());setPendMedia([]);}} disabled={propLoading}>Cancel</button>}
                </div>
              </form>}

              {ldTab==="mylistings" && <div className="fcard">
                <h3>My Listings</h3><p className="sub">{myProps.length} listing{myProps.length!==1?"s":""}.</p>
                {myProps.length===0 && <p style={{color:"#bbb",textAlign:"center",padding:"2rem"}}>No listings yet. Go to Add Listing.</p>}
                {myProps.map(p=>{
                  const externalTenancy = externalTenancyFor(p);
                  const externalTermEnd = externalLeaseTermEndsAt(externalTenancy);
                  const canConfirmExternalVacancy = Boolean(externalTermEnd && currentTime >= externalTermEnd.getTime());
                  return (
                  <div key={p.id} className="lrow">
                    <div className="lclr" style={{background:p.color}}>{p.initials}</div>
                    <div className="linfo">
                      <div className="ltitle">{p.title}</div>
                      <div className="lmeta">📍 {p.location} · {p.type} · {p.media?.length||0} media{p.approved===false?" · ⏳ Pending":""}</div>
                      {p.approved && <div className="lmeta">Availability last confirmed: {formatAvailabilityConfirmation(p.availabilityConfirmedAt)}</div>}
                      {externalTenancy && <div className="lmeta">External tenant: {externalTenancy.tenantName} · Move-in {externalDateLabel(externalTenancy.moveInDate)} · {externalTenancy.leaseMonths} month{externalTenancy.leaseMonths === 1 ? "" : "s"} · lease through {externalLeaseEndLabel(externalTenancy)}</div>}
                      {p.status === "taken" && !externalTenancy && <div className="lmeta">Manage HouseHunt tenancies through Booking Requests. If there is no active booking, record the existing external tenancy here.</div>}
                    </div>
                    <div className="lacts">
                      <div className="lstatus-group">
                        <span className={`sbadge sb-${p.status==="available"?"av":p.status==="pending"?"pd":"tk"}`}>{p.status==="available"?"✓ Available":p.status==="pending"?"⏳ Pending":p.status==="hidden"?"Hidden":"Occupied"}</span>
                        {p.approved===false && <span className="sbadge sb-pd">⏳ Pending</span>}
                        {p.boosted && <span className="sbadge sb-bo">⭐ Boosted</span>}
                      </div>
                      <div className="lrent">{KES(p.rent)}</div>
                      {p.approved && p.status === "available" && (
                        <>
                          <button type="button" className="bghost" onClick={() => void confirmAvailability(p.id)} disabled={availabilityConfirmingId === p.id} aria-busy={availabilityConfirmingId === p.id}>
                            {availabilityConfirmingId === p.id ? "Confirming…" : "Confirm available"}
                          </button>
                          <button type="button" className="bghost" onClick={() => markTaken(p.id)} disabled={propertyStatusUpdatingId === p.id}>Record external tenancy</button>
                        </>
                      )}
                      {p.approved && p.status === "taken" && externalTenancy && (
                        <button
                          type="button"
                          className="bghost"
                          onClick={() => markAvailable(p.id)}
                          disabled={!canConfirmExternalVacancy || propertyStatusUpdatingId === p.id}
                          title={!canConfirmExternalVacancy ? `Available after ${externalLeaseEndLabel(externalTenancy)}` : undefined}
                        >
                          {propertyStatusUpdatingId === p.id
                            ? "Updating…"
                            : canConfirmExternalVacancy
                              ? "Confirm vacant & mark available"
                              : `Available after ${externalLeaseEndLabel(externalTenancy)}`}
                        </button>
                      )}
                      {p.approved && p.status === "taken" && !externalTenancy && (
                        <button type="button" className="bghost" onClick={() => markTaken(p.id)} disabled={propertyStatusUpdatingId === p.id}>
                          Record external tenancy
                        </button>
                      )}
                      {p.approved && p.status === "available" && !p.boosted && <button type="button" className="bboost" onClick={() => void openPropertyPayment({ type: "boost", propId: p.id })}>Boost listing · KSh {settings.boostFee}</button>}
                      <button className="bghost" onClick={()=>beginEditProperty(p)}>Edit</button>
                      <button className="bdel" aria-label={`Delete listing: ${p.title}`} onClick={()=>deleteProp(p.id)}>🗑</button>
                    </div>
                  </div>
                );})}
              </div>}
            </div>
          </div>
        </div>
          )}
      {activeTab==="landlord" && !user && <div className="page" style={{textAlign:"center",padding:"5rem 2rem"}}>
        <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"2rem",marginBottom:"1rem"}}>Landlord Dashboard</h2>
        <p style={{color:"#bbb",marginBottom:"1.5rem"}}>Log in to manage your listings.</p>
        <button className="bp" onClick={()=>setAuthModal("landlord")}>Login / Sign Up Free →</button>
      </div>}

      {/* ─── ADMIN PANEL ─── */}
      {activeTab==="admin" && user?.role==="admin" && (
        <div className="admin-wrap">
          <div className="admin-topbar">
            <span style={{fontSize:"1.2rem"}}>⚙️</span>
            <div>
              <div className="atb-title">HouseHunt Kenya — Admin Control Centre</div>
              <div className="atb-sub">Full control over listings, users, content & site settings.</div>
              <div className="admin-topbar-summary">
                <span className="admin-pill">{propertiesLoading || propertiesError ? "—" : adminPropertyStats.total} Listings</span>
                <span className="admin-pill">{adminUsersLoading ? "—" : adminUserCounts.total} Users</span>
                <span className="admin-pill">{adminPropertyStats.pending ?? "—"} Pending</span>
                <span className="admin-pill">{adminPropertyStats.hidden ?? "—"} Hidden</span>
              </div>
            </div>
          </div>
          <div className="admin-page">
            <div className="dlayout">
              <div className="dside adm">
                <div className="dshead adm">
                  <div className="dav adm">A</div>
                  <div className="duname" style={{color:"#C4991A"}}>Administrator</div>
                  <div className="durole adm">Super Admin · Full Access</div>
                </div>
                <nav className="dsnav" aria-label="Admin dashboard">
                  {[
                    ["overview","📊","Overview"],
                    ["listings","🏠","All Listings",propertiesLoading || propertiesError ? null : adminPropertyStats.total],
                    ["flagged","🚩","Flagged",adminPropertyStatusReady ? flagged.length : null],
                    ["pending","⏳","Pending",adminPropertyStatusReady ? pending.length : null],
                    ["verify","✅","Verify Taken",adminPropertyStatusReady ? taken.length : null],
                    ["availability-reports","📣","Availability Reports"],
                    ["quality-review","🧭","Listing Quality Review"],
                    ["test-bookings","🧹","Test Bookings"],
                    ["users","👥","Users",adminUsersLoading ? null : adminUserCounts.total],
                    ["announce","📢","Announcements",activeAnns.length],
                    ["post","➕","Post New Listing"],
                    ["settings","⚙️","Site Settings"],
                    ["activity","📋","Activity Log"],
                  ].map(([k,ic,lb,cnt])=>(
                    <button key={k} type="button" className={`snb${adTab===k?" on":""}`} aria-current={adTab===k?"page":undefined} onClick={()=>setAdTab(k)}>
                      <span className="snbi">{ic}</span>{lb}
                      {cnt != null && <span className="snbc">{cnt}</span>}
                    </button>
                  ))}
                </nav>
              </div>

              <div>
                {/* OVERVIEW */}
                {adTab==="overview" && <div className="atab">
                  <h3>Platform Overview</h3><p className="sub">Live snapshot of HouseHunt Kenya.</p>
                  <div className="admin-summary-grid">
                    <div className="admin-summary-card">
                      <div className="admin-card-title">Platform health</div>
                      <div className="admin-card-value">{propertiesLoading ? "Loading…" : `${adminPropertyStats.total} listings`}</div>
                      <div className="admin-card-meta">{propertiesLoading ? "Loading listing status…" : `${adminPropertyStats.pending ?? "—"} pending review · ${adminPropertyStats.hidden ?? "—"} hidden`}</div>
                    </div>
                    <div className="admin-summary-card">
                      <div className="admin-card-title">User base</div>
                      <div className="admin-card-value">{adminUsersLoading ? "Loading…" : `${adminUserCounts.total} users`}</div>
                      <div className="admin-card-meta">{adminUsersLoading ? "Loading user counts…" : `${adminUserCounts.landlords} landlords · ${adminUserCounts.tenants} tenants`}</div>
                    </div>
                    <div className="admin-summary-card">
                      <div className="admin-card-title">Content trust</div>
                      <div className="admin-card-value">{activeAnns.length} announcements</div>
                      <div className="admin-card-meta">{adminPropertyStatusReady ? `${taken.length} taken units need verification` : "Listing status is loading"}</div>
                    </div>
                  </div>
                  <div className="admin-quick-actions">
                    <button className="bboost" onClick={()=>setAdTab("post")}>➕ Create Listing</button>
                    <button className="bapp" onClick={()=>setAdTab("pending")}>⏳ Review Pending</button>
                    <button className="bban" onClick={()=>setAdTab("flagged")}>🚩 Review Flagged</button>
                  </div>
                  <div className="akpis">
                    <div className="akpi"><div className="akpi-icon">🏠</div><div className="akpi-val">{propertiesLoading ? "—" : adminPropertyStats.total}</div><div className="akpi-lbl">Total Listings</div></div>
                    <div className="akpi"><div className="akpi-icon">✓</div><div className="akpi-val grn">{adminPropertyStats.available ?? "—"}</div><div className="akpi-lbl">Available</div></div>
                    <div className="akpi"><div className="akpi-icon">⊘</div><div className="akpi-val red">{adminPropertyStats.occupied ?? "—"}</div><div className="akpi-lbl">Taken</div></div>
                    <div className="akpi"><div className="akpi-icon">⭐</div><div className="akpi-val">{propertiesLoading || propertiesError ? "—" : props.filter(p=>p.boosted).length}</div><div className="akpi-lbl">Boosted</div></div>
                    <div className="akpi"><div className="akpi-icon">🚩</div><div className="akpi-val red">{adminPropertyStats.hidden ?? "—"}</div><div className="akpi-lbl">Hidden</div></div>
                    <div className="akpi"><div className="akpi-icon">👷</div><div className="akpi-val blu">{adminUsersLoading ? "—" : adminUserCounts.landlords}</div><div className="akpi-lbl">Landlords</div></div>
                    <div className="akpi"><div className="akpi-icon">👤</div><div className="akpi-val blu">{adminUsersLoading ? "—" : adminUserCounts.tenants}</div><div className="akpi-lbl">Tenants</div></div>
                    <div className="akpi"><div className="akpi-icon">📢</div><div className="akpi-val">{activeAnns.length}</div><div className="akpi-lbl">Announcements</div></div>
                  </div>
                </div>}

                {/* ALL LISTINGS */}
                {adTab==="listings" && <div className="atab">
                  <h3>All Listings</h3><p className="sub">Approve, flag, or delete any listing on the platform.</p>
                  {propertiesLoading && <EmptyState role="status">Loading listings…</EmptyState>}
                  {adminPropertyStatusReady && props.length===0 && <EmptyState>No listings yet.</EmptyState>}
                  {props.map(p=>(
                    <div key={p.id} className="arow">
                      <div className="arow-icon" style={{background:p.color}}>{p.initials}</div>
                      <div className="arow-info">
                        <div className="arow-title">{p.title}</div>
                        <div className="arow-meta">📍 {p.location} · {p.type} · {KES(p.rent)}/mo · LandlordID: {p.landlordId}</div>
                      </div>
                      <div className="arow-acts">
                        <span className={`sbadge sb-${p.status==="available"?"av":"tk"}`}>{p.status}</span>
                        {p.flagged && <span className="sbadge sb-fl">🚩 Flagged</span>}
                        {p.approved===false && <span className="sbadge sb-pd">⏳ Pending</span>}
                        {p.boosted && <span className="sbadge sb-bo">⭐ Boosted</span>}
                        {p.approved===false && <button className="bapp" onClick={()=>approveProp(p.id)}>✓ Approve</button>}
                        {!p.flagged && <button className="bban" onClick={()=>flagProp(p.id)}>🚩 Flag</button>}
                        {p.flagged && <button className="bapp" onClick={()=>approveProp(p.id)}>↩ Restore</button>}
                        <button className="bdel" onClick={()=>deleteProp(p.id)}>🗑 Delete</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* FLAGGED */}
                {adTab==="flagged" && <div className="atab">
                  <h3>Flagged Content</h3><p className="sub">Listings detected or manually flagged for inappropriate content.</p>
                  {propertiesLoading && <EmptyState role="status">Loading listings…</EmptyState>}
                  {!propertiesLoading && !propertiesError && !adminPropertySetComplete && <EmptyState role="status">Some listings are still loading. Flagged status cannot be confirmed yet.</EmptyState>}
                  {adminPropertyStatusReady && flagged.length===0 && <EmptyState>✅ No flagged content. Platform is clean.</EmptyState>}
                  {flagged.map(p=>(
                    <div key={p.id} className="arow" style={{borderLeft:"3px solid #dc2626"}}>
                      <div className="arow-icon" style={{background:p.color}}>{p.initials}</div>
                      <div className="arow-info"><div className="arow-title">{p.title}</div><div className="arow-meta">📍 {p.location} · Landlord: {p.landlordId}</div></div>
                      <div className="arow-acts">
                        <span className="sbadge sb-fl">🚩 Flagged</span>
                        <button className="bapp" onClick={()=>approveProp(p.id)}>✓ Restore</button>
                        <button className="bdel" onClick={()=>deleteProp(p.id)}>🗑 Delete</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* PENDING */}
                {adTab==="pending" && <div className="atab">
                  <h3>Pending Approval</h3><p className="sub">Listings awaiting admin review before going live.</p>
                  {propertiesLoading && <EmptyState role="status">Loading listings…</EmptyState>}
                  {!propertiesLoading && !propertiesError && !adminPropertySetComplete && <EmptyState role="status">Some listings are still loading. Pending status cannot be confirmed yet.</EmptyState>}
                  {adminPropertyStatusReady && pending.length===0 && <EmptyState>✅ No listings awaiting approval.</EmptyState>}
                  {pending.map(p=>(
                    <div key={p.id} className="arow" style={{borderLeft:"3px solid #C4991A"}}>
                      <div className="arow-icon" style={{background:p.color}}>{p.initials}</div>
                      <div className="arow-info"><div className="arow-title">{p.title}</div><div className="arow-meta">📍 {p.location} · {p.type} · {KES(p.rent)}/mo</div></div>
                      <div className="arow-acts">
                        <span className="sbadge sb-pd">⏳ Pending</span>
                        <button className="bapp" onClick={()=>approveProp(p.id)}>✓ Approve</button>
                        <button className="bdel" onClick={()=>deleteProp(p.id)}>🗑 Reject</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* VERIFY TAKEN */}
                {adTab==="verify" && <div className="atab">
                  <h3>Verify Taken Listings</h3><p className="sub">Admin is the final authority. Verifying confirms a listing is off-market.</p>
                  {propertiesLoading && <EmptyState role="status">Loading listings…</EmptyState>}
                  {!propertiesLoading && !propertiesError && !adminPropertySetComplete && <EmptyState role="status">Some listings are still loading. Taken status cannot be confirmed yet.</EmptyState>}
                  {adminPropertyStatusReady && taken.length===0 && <EmptyState>No listings marked as taken yet.</EmptyState>}
                  {taken.map(p=>(
                    <div key={p.id} className="arow" style={{borderLeft:"3px solid #dc2626"}}>
                      <div className="arow-icon" style={{background:p.color}}>{p.initials}</div>
                      <div className="arow-info">
                        <div className="arow-title">{p.title}</div>
                        <div className="arow-meta">📍 {p.location} · Occupied; availability follows its active booking or external tenancy.</div>
                        {externalTenancyFor(p) && <div className="arow-meta">External tenant: {externalTenancyFor(p).tenantName} · Lease through {externalLeaseEndLabel(externalTenancyFor(p))}</div>}
                      </div>
                      <div className="arow-acts">
                        <span className="sbadge sb-tk">⊘ Taken</span>
                        {!externalTenancyFor(p) && (
                          <button
                            className="bghost"
                            onClick={() => resolveLegacyOccupancy(p.id)}
                            disabled={propertyStatusUpdatingId === p.id}
                          >
                            Resolve legacy status
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>}

                {/* USERS */}
                {adTab==="users" && <div className="atab">
                  <h3>Manage Users</h3><p className="sub">Review, activate, deactivate, or remove users from the platform.</p>
                  {adminUsersLoading && <EmptyState role="status">Loading users…</EmptyState>}
                  {!adminUsersLoading && adminUsersError && <div className="form-error" role="alert">{adminUsersError}</div>}
                  {!adminUsersLoading && !adminUsersError && landlords.length === 0 && tenants.length === 0 && (
                    <EmptyState>No users found.</EmptyState>
                  )}
                  {!adminUsersLoading && !adminUsersError && landlords.length > 0 && (
                    <>
                      <div className="divlbl"><span style={{color:"#C4991A"}}>Landlords ({adminUserCounts.landlords})</span></div>
                      {landlords.map(l=>(
                        <div key={l.id} className="arow">
                          <div className="dav" style={{width:38,height:38,fontSize:"0.95rem",flexShrink:0,borderRadius:"50%",background:"#B5451B",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Cormorant Garamond,serif",fontWeight:700}}>{(l.name || "U").charAt(0).toUpperCase()}</div>
                          <div className="arow-info"><div className="arow-title">{l.name}</div><div className="arow-meta">{l.email} · Joined {l.joined}</div></div>
                          <div className="arow-acts">
                            {!l.isActive && <span className="sbadge sb-bn">🚫 Inactive</span>}
                            <button className={l.isActive ? "bban" : "bapp"} onClick={()=>setConfModal({
                              type: "ban",
                              title: l.isActive ? "Deactivate User" : "Activate User",
                              msg2: l.isActive ? `Deactivate ${l.name}? This will revoke their login access.` : `Restore access for ${l.name}?`,
                              onConfirm: () => toggleAdminUserStatus(l),
                            })}>{l.isActive ? "🚫 Deactivate" : "↩ Activate"}</button>
                            <button className="bdel" onClick={()=>setConfModal({ type:"delete", title:"Delete User", msg2:`Delete ${l.name}? This action is permanent and protected by backend rules.`, onConfirm: () => deleteAdminUser(l) })}>🗑 Delete</button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {!adminUsersLoading && !adminUsersError && tenants.length > 0 && (
                    <>
                      <div className="divlbl" style={{marginTop:"1.3rem"}}><span style={{color:"#C4991A"}}>Tenants ({adminUserCounts.tenants})</span></div>
                      {tenants.map(t=>(
                        <div key={t.id} className="arow">
                          <div style={{width:38,height:38,borderRadius:"50%",background:"#2D5016",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Cormorant Garamond,serif",fontWeight:700,fontSize:"0.95rem",flexShrink:0}}>{(t.name || "U").charAt(0).toUpperCase()}</div>
                          <div className="arow-info"><div className="arow-title">{t.name}</div><div className="arow-meta">{t.email} · Joined {t.joined}</div></div>
                          <div className="arow-acts">
                            {!t.isActive && <span className="sbadge sb-bn">🚫 Inactive</span>}
                            <button className={t.isActive ? "bban" : "bapp"} onClick={()=>setConfModal({
                              type: "ban",
                              title: t.isActive ? "Deactivate User" : "Activate User",
                              msg2: t.isActive ? `Deactivate ${t.name}? This will revoke their login access.` : `Restore access for ${t.name}?`,
                              onConfirm: () => toggleAdminUserStatus(t),
                            })}>{t.isActive ? "🚫 Deactivate" : "↩ Activate"}</button>
                            <button className="bdel" onClick={()=>setConfModal({ type:"delete", title:"Delete User", msg2:`Delete ${t.name}? This action is permanent and protected by backend rules.`, onConfirm: () => deleteAdminUser(t) })}>🗑 Delete</button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>}

                {/* ANNOUNCEMENTS */}
                {adTab==="announce" && <div className="atab">
                  <h3>Announcements & Banners</h3><p className="sub">Platform-wide notices shown to all users on every page.</p>
                  <form onSubmit={event=>{event.preventDefault();void postAnn();}}>
                    <div className="divlbl"><span style={{color:"#C4991A"}}>New Announcement</span></div>
                    <div className="fg admin-fg"><label htmlFor="announcement-title">Title</label><input id="announcement-title" placeholder="e.g. New listings in Kisumu!" value={annF.title} onChange={e=>setAnnF({...annF,title:e.target.value})}/></div>
                    <div className="fg admin-fg"><label htmlFor="announcement-message">Message</label><textarea id="announcement-message" placeholder="Full announcement text..." value={annF.body} onChange={e=>setAnnF({...annF,body:e.target.value})}/></div>
                    <div style={{marginBottom:"1rem"}}>
                      <div style={{fontSize:"0.68rem",fontWeight:700,color:"rgba(196,153,26,0.7)",textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:"6px"}}>Type</div>
                      <div className="ann-type-row" role="group" aria-label="Announcement type">
                        {["success","info","warning"].map(t=>(
                          <button key={t} type="button" aria-pressed={annF.type===t} className={`attbtn ${t}${annF.type===t?" sel":""}`} onClick={()=>setAnnF({...annF,type:t})}>{t==="success"?"🎉 News":t==="info"?"📢 Info":"⚠️ Warning"}</button>
                        ))}
                      </div>
                    </div>
                    <button type="submit" className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)",marginBottom:"1.5rem"}} disabled={annLoading}>
                      {annLoading ? "Publishing…" : "📢 Publish Announcement"}
                    </button>
                  </form>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Active ({activeAnns.length})</span></div>
                  {anns.length===0 && <EmptyState>No announcements yet.</EmptyState>}
                  {anns.map(a=>(
                    <div key={a.id} className="arow">
                      <div style={{fontSize:"1.4rem",flexShrink:0}}>{a.type==="success"?"🎉":a.type==="info"?"📢":"⚠️"}</div>
                      <div className="arow-info"><div className="arow-title">{a.title}</div><div className="arow-meta">{a.body.slice(0,60)}… · {a.date}</div></div>
                      <div className="arow-acts">
                        <span className={`sbadge ${a.active?"sb-bo":"sb-tk"}`}>{a.active?"Live":"Hidden"}</span>
                        <button className={a.active?"bban":"bapp"} onClick={()=>{setAnns(l=>l.map(x=>x.id===a.id?{...x,active:!x.active}:x));msg(a.active?"Announcement hidden.":"Restored.","info");}}>{a.active?"Hide":"Show"}</button>
                        <button type="button" className="bdel" aria-label={`Delete announcement: ${a.title}`} onClick={()=>{setAnns(l=>l.filter(x=>x.id!==a.id));msg("Deleted.","warn");}}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* POST NEW LISTING */}
                {adTab==="post" && <div className="atab">
                  <h3>Post New Listing</h3><p className="sub">Admin listings are auto-approved and boosted to the top.</p>
                  <form onSubmit={event=>{event.preventDefault();void adminPostListing();}}>
                    <input ref={admFileRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files,setAdmMedia)}/>
                    <div className="frow">
                      <div className="fg admin-fg"><label htmlFor="admin-listing-title">Title *</label><input id="admin-listing-title" placeholder="Premium 3BR in Kilimani" value={admListF.title} onChange={e=>setAdmListF({...admListF,title:e.target.value})}/></div>
                      <div className="fg admin-fg"><label htmlFor="admin-listing-location">Location *</label><input id="admin-listing-location" placeholder="Kilimani, Nairobi" value={admListF.location} onChange={e=>setAdmListF({...admListF,location:e.target.value})}/></div>
                    </div>
                    <div className="frow">
                      <div className="fg admin-fg"><label htmlFor="admin-listing-rent">Monthly Rent (KES) *</label><input id="admin-listing-rent" type="number" placeholder="30000" value={admListF.rent} onChange={e=>setAdmListF({...admListF,rent:e.target.value})}/></div>
                      <div className="fg admin-fg"><label htmlFor="admin-listing-type">Type</label>
                        <select id="admin-listing-type" value={admListF.type} onChange={e=>setAdmListF({...admListF,type:e.target.value})} style={{background:"rgba(255,255,255,0.06)",color:"#F5E6C8"}}>
                          {["Bedsitter","Room","Apartment","House","Penthouse"].map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="fg admin-fg"><label htmlFor="admin-listing-rooms">Rooms & Facilities</label><input id="admin-listing-rooms" placeholder="3 Bed · 2 Bath" value={admListF.rooms} onChange={e=>setAdmListF({...admListF,rooms:e.target.value})}/></div>
                    <div className="fg admin-fg"><label htmlFor="admin-listing-tags">Tags (comma-separated)</label><input id="admin-listing-tags" placeholder="WiFi, Pool, Parking" value={admListF.tags} onChange={e=>setAdmListF({...admListF,tags:e.target.value})}/></div>
                    <div className="fg admin-fg"><label htmlFor="admin-listing-rules">House Rules</label><textarea id="admin-listing-rules" placeholder="No pets. 2 months deposit." value={admListF.rules} onChange={e=>setAdmListF({...admListF,rules:e.target.value})}/></div>
                    <div style={{marginBottom:"1rem"}}>
                      <button type="button" className="bghost" style={{color:"#C4991A",borderColor:"rgba(196,153,26,0.28)",marginBottom:"0.7rem"}} onClick={()=>admFileRef.current.click()}><Icon name="upload" /> Upload Photos & Videos</button>
                      {admMedia.length>0 && <div className="mgrid">{admMedia.map((m,i)=>(
                        <div key={i} className="mitem">
                          {m.type==="image"?<img src={m.url} alt=""/>:<video src={m.url} muted loop/>}
                          <button type="button" className="mrm" aria-label={`Remove uploaded media ${i + 1}`} onClick={()=>setAdmMedia(l=>l.filter((_,j)=>j!==i))}>✕</button>
                          <span className="mtlbl"><Icon name="image" /></span>
                        </div>
                      ))}</div>}
                    </div>
                    <button type="submit" className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)",width:"100%",padding:"12px"}} disabled={adminListingLoading}>
                      {adminListingLoading ? "Posting…" : <><Icon name="home" /> Post & Auto-Boost <Icon name="arrowRight" /></>}
                    </button>
                  </form>
                </div>}

                {/* SETTINGS */}
                {adTab==="settings" && <form className="atab" onSubmit={event=>{event.preventDefault();msg("✅ Settings saved!","ok");}}>
                  <h3>Site Settings</h3><p className="sub">Control platform-wide behaviour, pricing, and moderation.</p>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Pricing</span></div>
                  <div className="frow">
                    <div className="fg admin-fg"><label htmlFor="setting-boost-fee">Boost Fee (KES)</label><input id="setting-boost-fee" type="number" value={settings.boostFee} readOnly /></div>
                    <div className="fg admin-fg"><label htmlFor="setting-unlock-fee">Unlock Fee (KES)</label><input id="setting-unlock-fee" type="number" value={settings.unlockFee} readOnly /></div>
                  </div>
                  <p className="paynote">M-PESA prices are set by the server using PROPERTY_BOOST_FEE_KES and PROPERTY_UNLOCK_FEE_KES.</p>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Moderation</span></div>
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <div className="toggle-label">Require Admin Approval for New Listings</div>
                      <div className="toggle-desc">When ON, all new listings must be approved before going live.</div>
                    </div>
                    <button type="button" className="toggle" role="switch" aria-checked={settings.requireApproval} aria-label="Require admin approval for new listings" style={{background:settings.requireApproval?"#C4991A":"rgba(255,255,255,0.1)"}} onClick={()=>setSettings(s=>({...s,requireApproval:!s.requireApproval}))}>
                      <div className="toggle-knob" style={{left:settings.requireApproval?"24px":"3px"}}/>
                    </button>
                  </div>
                  <div className="mod-notice">
                    <p><Icon name="shield" /> Content Moderation (Always Active)</p>
                    <p>Automatic profanity and inappropriate content filter runs on all text inputs. Listings with banned words are automatically blocked. {BANNED.length} banned terms monitored continuously.</p>
                  </div>
                  <button type="submit" className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)"}}>Save Settings →</button>
                </form>}

                {/* ACTIVITY LOG */}
                {adTab==="activity" && <AdminActivityLog />}
                {adTab==="availability-reports" && <AdminAvailabilityReports />}
                {adTab==="quality-review" && (
                  <AdminListingQualityReview
                    onView={openProperty}
                    onTakeOffline={async id => {
                      await updatePropertyStatusApi(id, "HIDDEN");
                      void refreshProperties();
                      msg("Listing taken offline for admin review.", "warn");
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab==="admin" && !user && <div className="page" style={{textAlign:"center",padding:"5rem 2rem"}}>
        <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"2rem",marginBottom:"1rem"}}>Admin Access Required</h2>
        <p style={{color:"#bbb",marginBottom:"1.5rem"}}>Restricted to administrators only.</p>
        <button className="bp" onClick={()=>setAuthModal("admin")}>Admin Login →</button>
      </div>}

      {/* ─── GUIDE ─── */}
      {tab==="guide" && <div className="page">
        <div className="sh"><div className="shey">Get Started</div><div className="shtt">How HouseHunt Kenya Works</div></div>
        <div className="ggrid">
          {[
            {n:"01",t:"Free Tenant Login",d:"Sign up as a tenant for free. Browse all listings with photos, videos, and property details instantly."},
            {n:"02",t:"Unlock Contacts",d:`Pay KSh ${settings.unlockFee} through a server-initiated M-PESA STK prompt to reveal the landlord's contact details and full property location. Access is granted after Daraja confirms payment.`},
            {n:"03",t:"Free Landlord Listing",d:"Landlords sign up and list properties for free with photos, videos, contact info, and social media links."},
            {n:"04",t:"Boost Your Listing",d:`Pay KSh ${settings.boostFee} through M-PESA to feature an approved available listing for 30 days. The boost is applied after Daraja confirms payment.`},
            {n:"05",t:"Booking & Availability",d:"A booking request records interest but does not reserve a home. The landlord confirms only after arrangements are agreed; this marks the listing taken. For an agreement made outside HouseHunt, landlords record the tenant and lease dates when marking it taken, including existing untracked tenancies."},
            {n:"06",t:"Platform Payments Only",d:"HouseHunt only processes payments for contact unlocks and optional listing boosts. Tenants and landlords coordinate all other arrangements directly."},
            {n:"07",t:"Mark Available Again",d:"Both parties confirm completion for a HouseHunt tenancy. For an external tenancy, the landlord can confirm vacancy only after the recorded lease term ends. Admins can resolve disputed HouseHunt tenancies after review."},
            {n:"08",t:"Save & Share Homes",d:"Use the heart on a listing to keep it in Saved Homes on this browser, or share its listing link with friends and family."},
          ].map(s=>(
            <div key={s.n} className="gcard">
              <div className="gnum">{s.n}</div><h4>{s.t}</h4><p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>}
      </main>
      )}

      <Footer user={user} setTab={setTab} setAuthModal={setAuthModal} />

      {/* ─── PROPERTY MODAL ─── */}
      {liveProp && (
        <Modal dialogRef={modalRef} labelledBy="property-details-title" onBackdropClick={closeModal}>
            <div className="mhero" style={{background:`linear-gradient(135deg,${liveProp.color}cc,${liveProp.color}77)`}}>
              {liveProp.media?.length>0 ? (
                liveProp.media[midx]?.type==="video"
                  ? <video src={liveProp.media[midx].url} autoPlay muted loop playsInline preload="metadata" aria-label={liveProp.title} />
                  : <img src={liveProp.media[midx].url} alt={liveProp.title} decoding="async" />
              ) : (
                <div className="mhero-empty" aria-label={`${liveProp.title} image unavailable`}>
                  <span className="fallback-mark">⌂</span><strong>{liveProp.initials}</strong><small>Image coming soon</small>
                </div>
              )}
              <div className="mhero-ov" />
              {canManage && <button className="bdel" aria-label={`Delete listing: ${liveProp.title}`} style={{position:"absolute",top:12,left:12,zIndex:10}} onClick={()=>deleteProp(liveProp.id)}><Icon name="trash" /> Delete</button>}
              <button className="mclose" aria-label="Close property details" onClick={closeModal}>✕</button>
            </div>
            <PropertyGallery media={liveProp.media} midx={midx} setMidx={setMidx} />
            <PropertyDetails
              liveProp={liveProp}
              landlord={selectedLandlord}
              user={user}
              isUnlocked={isUnlocked}
              settings={settings}
              onRequestPayment={openPropertyPayment}
              setAuthModal={setAuthModal}
              closeModal={closeModal}
              canBook={Boolean(user && user.role === "tenant" && liveProp?.status === "available" && liveProp?.approved !== false)}
              onBookRequest={() => openBookingForm(liveProp)}
              onShare={shareProperty}
            />
            {canManage && (
              <PropertyActions
                canManage={canManage}
                liveProp={liveProp}
                markTaken={markTaken}
                markAvailable={markAvailable}
                canConfirmExternalVacancy={Boolean(
                  externalLeaseTermEndsAt(externalTenancyFor(liveProp)) &&
                  currentTime >= externalLeaseTermEndsAt(externalTenancyFor(liveProp)).getTime()
                )}
                flagProp={flagProp}
                approveProp={approveProp}
                setSelProp={setSelProp}
                user={user}
              />
            )}
        </Modal>
      )}

      {/* ─── BOOKING MODAL ─── */}
      {bookingFormOpen && bookingProperty && (
        <Modal dialogRef={modalRef} labelledBy="booking-title" className="auth" onBackdropClick={resetBookingForm}>
            <button className="mclose" aria-label="Close booking form" onClick={resetBookingForm}>✕</button>
            <div className="auth-head">
              <div className="auth-icon"><Icon name="calendar" /></div>
              <div>
                <h2 id="booking-title" className="auth-title">Request Booking</h2>
                <p className="auth-subtitle">{bookingProperty.title}</p>
              </div>
            </div>

            <form onSubmit={submitBooking}>
              <div className="fg">
                <label htmlFor="booking-move-in-date">Move-in date</label>
                <input id="booking-move-in-date" type="date" min={todayStr()} value={bookingForm.moveInDate} onChange={e=>setBookingForm({...bookingForm, moveInDate: e.target.value})} disabled={bookingSubmitting} />
              </div>
              <div className="fg">
                <label htmlFor="booking-lease-months">Lease duration (months)</label>
                <input id="booking-lease-months" type="number" min="1" step="1" value={bookingForm.leaseMonths} onChange={e=>setBookingForm({...bookingForm, leaseMonths: e.target.value})} disabled={bookingSubmitting} />
              </div>
              <div className="fg">
                <label htmlFor="booking-notes">Notes</label>
                <textarea id="booking-notes" rows="4" value={bookingForm.notes} onChange={e=>setBookingForm({...bookingForm, notes: e.target.value})} disabled={bookingSubmitting} placeholder="Optional notes for the landlord" />
              </div>
              {bookingFormError && <div className="aerr">⚠️ {bookingFormError}</div>}
              <button className="bp auth-submit" type="submit" disabled={bookingSubmitting} aria-busy={bookingSubmitting}>
                {bookingSubmitting ? "Submitting booking…" : "Submit Booking Request →"}
              </button>
            </form>
        </Modal>
      )}

      {/* ─── AUTH MODAL ─── */}
      {authModal && (
        <Modal dialogRef={modalRef} labelledBy="auth-title" className="auth" onBackdropClick={() => setAuthModal(null)}>
            <button className="mclose" aria-label="Close authentication" onClick={()=>setAuthModal(null)}>✕</button>
            <div className="auth-head">
              <div className="auth-icon"><Icon name={authF.mode==="forgot"||authF.mode==="reset"||authModal==="admin" ? "key" : authModal==="landlord" ? "home" : "user"} /></div>
              <div>
                <h2 id="auth-title" className="auth-title">
                  {authF.mode==="forgot" ? "Reset your password"
                    : authF.mode==="reset" ? "Choose a new password"
                      : authModal==="admin" ? "Admin Access"
                        : authModal==="landlord" ? "Landlord Portal" : "Tenant Portal"}
                </h2>
                <p className="auth-subtitle">
                  {authF.mode==="forgot"
                    ? "Enter your account email and we’ll send a secure, time-limited reset link if an account exists."
                    : authF.mode==="reset"
                      ? "Choose a new password with at least 8 characters."
                      : authModal==="admin"
                        ? "Restricted access for administrators only."
                        : authModal==="landlord"
                          ? "Join free to list properties, manage bookings and share your space."
                          : `Browse homes and unlock landlord contacts for KSh ${settings.unlockFee}.`}
                </p>
              </div>
            </div>
            {(authF.mode==="login" || authF.mode==="register") && (
              <div className="auth-role-tabs" role="group" aria-label="Account type">
                {["tenant","landlord","admin"].map(role => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={authModal===role}
                    className={authModal===role ? "selected" : ""}
                    onClick={() => setAuthModal(role)}
                  >
                    {role === "tenant" ? "Tenant" : role === "landlord" ? "Landlord" : "Admin"}
                  </button>
                ))}
              </div>
            )}
            {(authF.mode==="login" || authF.mode==="register") && authModal!=="admin" && (
              <div className="auth-tabs">
                <button type="button" className={`at${authF.mode==="login"?" on":""}`} onClick={()=>switchAuthMode("login")}>Sign In</button>
                <button type="button" className={`at${authF.mode==="register"?" on":""}`} onClick={()=>switchAuthMode("register")}>Sign Up Free</button>
              </div>
            )}
            {authErr && <div className="aerr">⚠️ {authErr}</div>}
            {authNotice && <div className="field-success" role="status">{authNotice}</div>}
            {authF.mode==="register" && authModal!=="admin" && (
              <div className="fg">
                <label htmlFor="auth-full-name">Full Name</label>
                <input id="auth-full-name" ref={authNameRef} maxLength={80} placeholder="e.g. Jane Doe" value={authF.name} onChange={e=>{setAuthF({...authF,name:e.target.value});setAuthFieldErrors(current=>({...current,name:undefined}));}} disabled={authLoading} aria-invalid={Boolean(authFieldErrors.name)} />
                {authFieldErrors.name && <div className="field-error" role="alert">{authFieldErrors.name}</div>}
              </div>
            )}
            {authF.mode!=="reset" && (
              <div className="fg">
                <label htmlFor="auth-email">Email</label>
                <input id="auth-email" ref={authEmailRef} maxLength={120} type="email" autoComplete="email" placeholder="you@example.com" value={authF.email} onChange={e=>{setAuthF({...authF,email:e.target.value});setAuthErr("");setAuthNotice("");setAuthFieldErrors(current=>({...current,email:undefined}));}} disabled={authLoading || passwordResetLoading} aria-invalid={Boolean(authFieldErrors.email || (authErr && authF.email && !/^\S+@\S+\.\S+$/.test(authF.email)))} />
                {authFieldErrors.email && <div className="field-error" role="alert">{authFieldErrors.email}</div>}
              </div>
            )}
            {(authF.mode==="login" || authF.mode==="register") && (
              <div className="fg">
                <label htmlFor="auth-password">Password</label>
                <div className="password-field"><input id="auth-password" ref={authPasswordRef} maxLength={128} type={showPassword ? "text" : "password"} autoComplete={authF.mode==="register"?"new-password":"current-password"} placeholder="••••••••" value={authF.password} onChange={e=>{setAuthF({...authF,password:e.target.value});setAuthErr("");setAuthNotice("");setAuthFieldErrors(current=>({...current,password:undefined}));}} disabled={authLoading} aria-invalid={Boolean(authFieldErrors.password || (authErr && authF.password.length < 8))} /><button type="button" className="password-toggle" onClick={() => setShowPassword(visible => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eyeOff" : "eye"} /></button></div>
                {authFieldErrors.password && <div className="field-error" role="alert">{authFieldErrors.password}</div>}
                {authF.mode==="login" && (
                  <div className="auth-forgot-row">
                    <button type="button" className="auth-forgot-link" onClick={()=>switchAuthMode("forgot")}>Forgot password?</button>
                  </div>
                )}
              </div>
            )}
            {authF.mode==="reset" && new URLSearchParams(location.search).get("token") && (
              <>
                <div className="fg">
                  <label htmlFor="reset-new-password">New password</label>
                  <input id="reset-new-password" type="password" autoComplete="new-password" minLength={8} value={passwordResetForm.newPassword} onChange={event=>setPasswordResetForm(current=>({...current,newPassword:event.target.value}))} disabled={passwordResetLoading} required />
                </div>
                <div className="fg">
                  <label htmlFor="reset-confirm-password">Confirm new password</label>
                  <input id="reset-confirm-password" type="password" autoComplete="new-password" minLength={8} value={passwordResetForm.confirmPassword} onChange={event=>setPasswordResetForm(current=>({...current,confirmPassword:event.target.value}))} disabled={passwordResetLoading} required />
                </div>
              </>
            )}
            {authF.mode==="reset" && !new URLSearchParams(location.search).get("token") && (
              <div className="aerr" role="alert">This reset link is missing its token. Request a new one.</div>
            )}
            {authF.mode==="forgot" && (
              <button className="bp auth-submit" type="button" onClick={()=>void sendPasswordResetLink()} disabled={passwordResetLoading} aria-busy={passwordResetLoading}>
                {passwordResetLoading ? "Sending reset link…" : "Send reset link"}
              </button>
            )}
            {authF.mode==="reset" && new URLSearchParams(location.search).get("token") && (
              <button className="bp auth-submit" type="button" onClick={()=>void submitPasswordReset()} disabled={passwordResetLoading} aria-busy={passwordResetLoading}>
                {passwordResetLoading ? "Updating password…" : "Reset password"}
              </button>
            )}
            {(authF.mode==="login" || authF.mode==="register") && (
              <button className="bp auth-submit" type="button" onClick={()=>authF.mode==="register"?doRegister(authModal):doLogin(authModal)} disabled={authLoading} aria-busy={authLoading}>
                {authLoading ? <><span className="button-spinner" aria-hidden="true" /> {authF.mode==="register" ? "Creating account…" : "Signing in…"}</> : authF.mode==="register" ? "Create Free Account →" : "Sign In →"}
              </button>
            )}
            {authF.mode==="forgot" && (
              <p className="auth-switch">
                Remembered it?
                <button type="button" className="auth-switch-btn" onClick={()=>switchAuthMode("login")}>Back to sign in</button>
              </p>
            )}
            {authF.mode==="reset" && (
              <p className="auth-switch">
                Need a different link?
                <button type="button" className="auth-switch-btn" onClick={()=>switchAuthMode("forgot")}>Request another</button>
              </p>
            )}
            {(authF.mode==="login" || authF.mode==="register") && authModal!=="admin" && (
              <p className="auth-switch">
                {authF.mode==="login" ? "New to HouseHunt?" : "Already have an account?"}
                  <button type="button" className="auth-switch-btn" onClick={()=>switchAuthMode(authF.mode==="login"?"register":"login")}>
                  {authF.mode==="login" ? "Create one" : "Sign in"}
                </button>
              </p>
            )}
        </Modal>
      )}

      {passwordModalOpen && (
        <Modal dialogRef={modalRef} labelledBy="password-title" className="auth" onBackdropClick={() => !passwordSaving && setPasswordModalOpen(false)}>
            <button
              className="mclose"
              aria-label="Close change password"
              onClick={() => setPasswordModalOpen(false)}
              disabled={passwordSaving}
            >
              ✕
            </button>
            <div className="auth-head">
              <div className="auth-icon"><Icon name="key" /></div>
              <div>
                <h2 id="password-title" className="auth-title">Change password</h2>
                <p className="auth-subtitle">Enter your current password, then choose a new password with at least 8 characters.</p>
              </div>
            </div>
            <form onSubmit={submitPasswordChange}>
              <div className="fg">
                <label htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))}
                  required
                  disabled={passwordSaving}
                />
              </div>
              <div className="fg">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordForm.newPassword}
                  onChange={event => setPasswordForm(current => ({ ...current, newPassword: event.target.value }))}
                  required
                  disabled={passwordSaving}
                />
              </div>
              <div className="fg">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordForm.confirmPassword}
                  onChange={event => setPasswordForm(current => ({ ...current, confirmPassword: event.target.value }))}
                  required
                  disabled={passwordSaving}
                />
              </div>
              {passwordError && <div className="form-error" role="alert">{passwordError}</div>}
              {passwordSuccess && <div className="field-success" role="status">{passwordSuccess}</div>}
              <button className="bp auth-submit" type="submit" disabled={passwordSaving} aria-busy={passwordSaving}>
                {passwordSaving ? "Updating password…" : "Update password"}
              </button>
            </form>
        </Modal>
      )}

      {/* ─── PAYMENT MODAL ─── */}
      {payModal && (
        <Modal dialogRef={modalRef} labelledBy="property-payment-title" className="pay" onBackdropClick={() => !payLoading && setPayModal(null)}>
            <button className="mclose" aria-label="Close payment" style={{position:"static",float:"right",marginBottom:"0.4rem"}} onClick={()=>!payLoading && setPayModal(null)} disabled={payLoading}>✕</button>
            <div style={{fontSize:"2.4rem",marginBottom:"0.4rem"}}><Icon name={payModal.type==="boost" ? "star" : "unlock"} /></div>
            <h2 id="property-payment-title" style={{fontFamily:"Cormorant Garamond,serif",fontSize:"1.5rem",fontWeight:700,marginBottom:"0.25rem"}}>{payModal.type==="boost"?"Boost Your Listing":"Unlock This Listing"}</h2>
            <p style={{color:"#777",fontSize:"0.84rem",marginBottom:"0.8rem",lineHeight:1.6}}>{payModal.type==="boost"?"Feature this approved listing in search results for 30 days.":"Reveal the full property location and landlord contact details."}</p>
            <div className="payamt">{KES(payModal.amount || (payModal.type==="boost" ? settings.boostFee : settings.unlockFee))} <small>KES</small></div>
            {!payModal.hasStkPush && (
              <div className="fg" style={{textAlign:"left",marginTop:"1rem"}}>
                <label htmlFor="property-payment-phone">M-PESA phone number</label>
                <input
                  id="property-payment-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="0712345678"
                  value={payPhone}
                  onChange={event => setPayPhone(event.target.value)}
                  disabled={payLoading}
                />
              </div>
            )}
            {payError && <div className="form-error" role="alert">{payError}</div>}
            {payModal.message && <p className="paynote" role="status">{payModal.message}</p>}
            {payModal.hasStkPush && payModal.status === "PENDING" ? (
              <button className="mpesabtn" type="button" onClick={() => void refreshPropertyPaymentStatus(true)} disabled={payLoading || payModal.paymentLookupLoading} aria-busy={payLoading || payModal.paymentLookupLoading}>
                {payModal.paymentLookupLoading ? "Checking for payment…" : payLoading ? "Checking payment…" : "Check payment status"}
              </button>
            ) : (
              <button className="mpesabtn" type="button" onClick={() => void handlePropertyPayment()} disabled={payLoading || payModal.paymentLookupLoading || !payPhone.trim()} aria-busy={payLoading || payModal.paymentLookupLoading}>
              {payModal.paymentLookupLoading ? "Checking for payment…" : payLoading ? "Sending STK Push…" : payModal.status === "FAILED" ? "Try M-PESA again" : "Send M-PESA STK Push"}
              </button>
            )}
            <p className="paynote">An M-PESA prompt will be sent to this phone. Approve it on your device; access or the boost is applied only after the server confirms payment with Daraja.</p>
        </Modal>
      )}

      {/* ─── CONFIRM MODAL ─── */}
      {confModal && (
        <Modal dialogRef={modalRef} labelledBy="confirmation-title" className="conf" onBackdropClick={() => setConfModal(null)}>
            <div style={{fontSize:"2.3rem",marginBottom:"0.7rem"}}><Icon name={confModal.type==="ban" ? "shield" : confModal.type==="completion" ? "checkCircle" : "trash"} /></div>
            <h2 id="confirmation-title" style={{fontFamily:"Cormorant Garamond,serif",fontSize:"1.4rem",fontWeight:700,marginBottom:"0.5rem"}}>{confModal.title}</h2>
            <p style={{fontSize:"0.81rem",color:"#777",lineHeight:1.6}}>{confModal.msg2}</p>
            {confModal.terminationAction === "REQUEST" && (
              <div className="fg" style={{textAlign:"left",marginTop:"1rem"}}>
                <label htmlFor="early-termination-reason">Reason for requesting early termination</label>
                <textarea
                  id="early-termination-reason"
                  rows={4}
                  maxLength={1000}
                  value={terminationReason}
                  onChange={event => setTerminationReason(event.target.value)}
                  placeholder="Explain why you are requesting to end the tenancy early."
                />
                <small>{terminationReason.trim().length}/1000 characters · at least 10 required</small>
              </div>
            )}
            {confModal.type === "external-tenancy" && (
              <div className="fg" style={{textAlign:"left",marginTop:"1rem"}}>
                <label htmlFor="external-tenant-name">Tenant name</label>
                <input
                  id="external-tenant-name"
                  type="text"
                  maxLength={120}
                  value={externalTenancyForm.tenantName}
                  onChange={event => {
                    const next = { ...externalTenancyForm, tenantName: event.target.value };
                    externalTenancyFormRef.current = next;
                    setExternalTenancyForm(next);
                    setExternalTenancyError("");
                  }}
                  disabled={propertyStatusUpdatingId === confModal.propertyId}
                />
                <label htmlFor="external-tenancy-move-in">Move-in date</label>
                <input
                  id="external-tenancy-move-in"
                  type="date"
                  max={todayStr()}
                  value={externalTenancyForm.moveInDate}
                  onChange={event => {
                    const next = { ...externalTenancyForm, moveInDate: event.target.value };
                    externalTenancyFormRef.current = next;
                    setExternalTenancyForm(next);
                    setExternalTenancyError("");
                  }}
                  disabled={propertyStatusUpdatingId === confModal.propertyId}
                />
                <label htmlFor="external-tenancy-months">Lease duration (months)</label>
                <input
                  id="external-tenancy-months"
                  type="number"
                  min="1"
                  step="1"
                  value={externalTenancyForm.leaseMonths}
                  onChange={event => {
                    const next = { ...externalTenancyForm, leaseMonths: event.target.value };
                    externalTenancyFormRef.current = next;
                    setExternalTenancyForm(next);
                    setExternalTenancyError("");
                  }}
                  disabled={propertyStatusUpdatingId === confModal.propertyId}
                />
                {externalTenancyError && <p className="form-error" role="alert">{externalTenancyError}</p>}
              </div>
            )}
            <div className="confbtns">
              <button className="confcancel" onClick={()=>setConfModal(null)} disabled={propertyStatusUpdatingId === confModal.propertyId}>Cancel</button>
              <button
                className={confModal.type==="ban"||confModal.type==="completion"?"confban":"confdel"}
                disabled={confModal.terminationAction === "REQUEST" && terminationReason.trim().length < 10}
                onClick={confModal.onConfirm}
              >
                {propertyStatusUpdatingId === confModal.propertyId
                  ? "Updating…"
                  : confModal.confirmLabel || (confModal.type==="ban"?"Confirm":confModal.type==="close-test"?"Close booking":confModal.type==="test-data"?"Mark as test":"Delete")}
              </button>
            </div>
        </Modal>
      )}

      {toast && <Toast variant={toast.k}>{toast.m}</Toast>}
    </div>
  );
}
