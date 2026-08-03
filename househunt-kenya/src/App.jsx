import { useState, useRef } from "react";

// ── MODERATION ────────────────────────────────────────────────────────────────
const BANNED = ["porn","pornography","xxx","nude","naked","pussy","dick","cock","fuck","shit","bitch","whore","slut","nigger","faggot","bastard","cunt","retard","escort","prostitute","hooker","cocaine","heroin","kill yourself","kys","insult","stupid idiot"];
const dirty = t => { if(!t) return false; const l=t.toLowerCase(); return BANNED.some(w=>l.includes(w)); };
const dirtyObj = o => [o.title,o.location,o.rules,o.rooms,...(o.tags||[])].some(dirty);

// ── DATA ──────────────────────────────────────────────────────────────────────
const ADMIN_CREDS = { user:"admin", pass:"admin2024" };
const KES = n=>`KSh ${Number(n).toLocaleString()}`;
const nowStr = ()=>new Date().toLocaleString("en-KE",{hour12:false}).replace(","," ");
const todayStr = ()=>new Date().toISOString().split("T")[0];

const SEED_PROPS = [
  {id:1,title:"Spacious 2-Bedroom Apartment",location:"Westlands, Nairobi",rent:35000,rooms:"2 Bed · 1 Bath",type:"Apartment",rules:"No pets. Quiet hours after 10 PM. References required.",tags:["WiFi","Parking","Security"],color:"#B5451B",initials:"WN",media:[],landlordId:"L001",status:"available",boosted:true,flagged:false,approved:true,contact:{phone:"+254 712 345 678",whatsapp:"+254712345678",email:"grace@mail.com",ig:"grace_homes",fb:"GraceHomes",tt:"grace_ke",tw:"GraceHomes"}},
  {id:2,title:"Affordable Single Room",location:"Kilimani, Nairobi",rent:12000,rooms:"Studio · Shared Bath",type:"Room",rules:"Rent due on 1st. No loud music.",tags:["Water Included","Near Matatu"],color:"#2D5016",initials:"KN",media:[],landlordId:"L002",status:"available",boosted:false,flagged:false,approved:true,contact:{phone:"+254 720 111 222",whatsapp:"+254720111222",email:"john@mail.com",ig:"",fb:"KilimaniRooms",tt:"",tw:""}},
  {id:3,title:"Modern 3-Bedroom House",location:"Mombasa Island",rent:45000,rooms:"3 Bed · 2 Bath",type:"House",rules:"Family preferred. No sub-letting.",tags:["Garden","Parking","Borehole"],color:"#C4991A",initials:"MI",media:[],landlordId:"L001",status:"taken",boosted:false,flagged:false,approved:true,contact:{phone:"+254 733 900 100",whatsapp:"+254733900100",email:"grace@mail.com",ig:"grace_homes",fb:"",tt:"grace_ke",tw:""}},
  {id:4,title:"Executive 1-Bedroom",location:"Lavington, Nairobi",rent:28000,rooms:"1 Bed · 1 Bath",type:"Apartment",rules:"No parties. Professionals preferred.",tags:["Gym","Pool","24hr Security"],color:"#7C3A1E",initials:"LN",media:[],landlordId:"L002",status:"available",boosted:true,flagged:false,approved:true,contact:{phone:"+254 700 456 789",whatsapp:"+254700456789",email:"john@mail.com",ig:"lavington_exec",fb:"LavingtonExec",tt:"",tw:"LavingtonExec"}},
  {id:5,title:"Cosy Bedsitter",location:"Ngong Road, Nairobi",rent:9500,rooms:"Bedsitter · Shared Facilities",type:"Bedsitter",rules:"Students welcome. 2 months deposit.",tags:["DSTV","Water 24hr"],color:"#E05A1E",initials:"NG",media:[],landlordId:"L002",status:"available",boosted:false,flagged:false,approved:true,contact:{phone:"+254 745 678 901",whatsapp:"",email:"john@mail.com",ig:"",fb:"",tt:"",tw:""}},
  {id:6,title:"Luxury Penthouse",location:"Runda, Nairobi",rent:120000,rooms:"4 Bed · 3 Bath",type:"Penthouse",rules:"Diplomatic/corporate tenants. Long lease.",tags:["City View","Concierge","Gym","Pool"],color:"#1A1A2E",initials:"RN",media:[],landlordId:"L001",status:"available",boosted:true,flagged:false,approved:true,contact:{phone:"+254 799 000 001",whatsapp:"+254799000001",email:"grace@mail.com",ig:"grace_homes",fb:"GraceHomes",tt:"grace_ke",tw:"GraceHomes"}},
];

const SEED_LANDLORDS = [
  {id:"L001",name:"Grace Wanjiku",email:"grace@mail.com",password:"grace123",phone:"+254 712 345 678",whatsapp:"+254712345678",ig:"grace_homes",fb:"GraceHomes",tt:"grace_ke",tw:"GraceHomes",banned:false,joined:"2024-01-05"},
  {id:"L002",name:"John Kamau",email:"john@mail.com",password:"john123",phone:"+254 720 111 222",whatsapp:"+254720111222",ig:"",fb:"KilimaniRooms",tt:"",tw:"",banned:false,joined:"2024-01-18"},
];

const SEED_TENANTS = [
  {id:"T001",name:"Amina Odhiambo",email:"amina@mail.com",password:"amina123",unlocked:[],banned:false,joined:"2024-02-01"},
];

const SEED_ANNOUNCEMENTS = [
  {id:"A1",title:"Welcome to HouseHunt Kenya!",body:"Kenya's most trusted property marketplace. Verified listings across 12 cities.",type:"success",date:"2024-01-15",active:true},
  {id:"A2",title:"Mombasa listings are now live 🎉",body:"50+ verified listings on Mombasa Island and Nyali just added.",type:"info",date:"2024-02-10",active:true},
];

const SEED_LOG = [
  {id:1,time:"2024-02-16 14:22",action:"Contact unlocked",detail:"Amina · Luxury Penthouse · KSh 100",kind:"payment"},
  {id:2,time:"2024-02-16 08:30",action:"Listing boosted",detail:"Executive 1BR · Grace · KSh 200",kind:"payment"},
  {id:3,time:"2024-02-15 11:15",action:"Tenant registered",detail:"Amina Odhiambo",kind:"success"},
  {id:4,time:"2024-02-15 09:42",action:"Listing posted",detail:"Spacious 2BR · Grace Wanjiku",kind:"info"},
];



// ── PROP CARD COMPONENT ───────────────────────────────────────────────────────
function PropCard({ p, onView, user, onDel }) {
  const canDel = user?.role==="admin" || (user?.role==="landlord" && p.landlordId===user.data.id);
  const cover = p.media?.find(m=>m.type==="image");
  return (
    <div className={`pcard${p.boosted?" boosted":""}${p.status==="taken"?" taken":""}${p.flagged?" flagged":""}`}>
      {p.boosted && <div className="crown">⭐ Featured Listing</div>}
      <div className="pthumb" onClick={()=>onView(p)}>
        <div className="pthumb-bg" style={{background:`linear-gradient(135deg,${p.color}cc,${p.color}77)`}}/>
        {cover && <img src={cover.url} alt={p.title}/>}
        {cover && <div className="pthumb-ov"/>}
        <span className="pinit">{p.initials}</span>
        <div className="ptyp">{p.type}</div>
        {p.status==="taken" && <div className="ptaken">⊘ Taken</div>}
        {p.flagged && <div className="pflag">🚩 Flagged</div>}
        {p.media?.length>0 && <div className="pmcnt">📷 {p.media.length}</div>}
      </div>
      <div className="pbody">
        <div className="ptitle">{p.title}</div>
        <div className="ploc">📍 {p.location}</div>
        <div className="pmeta">
          <div className="prent">{KES(p.rent)}<sub>/mo</sub></div>
          <div className="prooms">{p.rooms}</div>
        </div>
        <div className="tags">{p.tags.slice(0,3).map(t=><span key={t} className="tag">{t}</span>)}</div>
        <div className="pfoot">
          <button className="pvbtn" onClick={()=>onView(p)}>View Details →</button>
          {canDel && <button className="pdbtn" onClick={e=>{e.stopPropagation();onDel(p.id);}}>🗑</button>}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [props, setProps] = useState(SEED_PROPS);
  const [landlords, setLandlords] = useState(SEED_LANDLORDS);
  const [tenants, setTenants] = useState(SEED_TENANTS);
  const [anns, setAnns] = useState(SEED_ANNOUNCEMENTS);
  const [log, setLog] = useState(SEED_LOG);
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [selProp, setSelProp] = useState(null);
  const [midx, setMidx] = useState(0);
  const [authModal, setAuthModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [confModal, setConfModal] = useState(null);
  const [search, setSearch] = useState("");
  const [budget, setBudget] = useState("");
  const [ptype, setPtype] = useState("");
  const [ldTab, setLdTab] = useState("profile");
  const [adTab, setAdTab] = useState("overview");
  const [pendMedia, setPendMedia] = useState([]);
  const [dragOv, setDragOv] = useState(false);
  const [form, setForm] = useState({title:"",location:"",rent:"",rooms:"",rules:"",type:"Apartment",tags:""});
  const [cwarn, setCwarn] = useState(false);
  const [authF, setAuthF] = useState({name:"",email:"",password:"",mode:"login"});
  const [authErr, setAuthErr] = useState("");
  const [annF, setAnnF] = useState({title:"",body:"",type:"success"});
  const [admListF, setAdmListF] = useState({title:"",location:"",rent:"",rooms:"",type:"Apartment",rules:"",tags:""});
  const [admMedia, setAdmMedia] = useState([]);
  const [settings, setSettings] = useState({boostFee:200,unlockFee:100,requireApproval:false});
  const fileRef = useRef();
  const admFileRef = useRef();

  const addLog = (action, detail, kind="info") => setLog(l=>[{id:Date.now(),time:nowStr(),action,detail,kind},...l.slice(0,49)]);
  const msg = (m, k="ok") => { setToast({m,k}); setTimeout(()=>setToast(null),3000); };

  const sorted = [...props]
    .filter(p => user?.role==="admin" ? true : p.approved!==false)
    .sort((a,b) => (b.boosted?1:0)-(a.boosted?1:0));

  const filtered = sorted.filter(p=>{
    const s=search.toLowerCase();
    const ms=!s||p.location.toLowerCase().includes(s)||p.title.toLowerCase().includes(s);
    let mb=true;
    if(budget==="low") mb=p.rent<15000;
    else if(budget==="mid") mb=p.rent>=15000&&p.rent<=35000;
    else if(budget==="high") mb=p.rent>35000;
    return ms&&mb&&(!ptype||p.type===ptype);
  });

  const myProps = user?.role==="landlord" ? props.filter(p=>p.landlordId===user.data.id) : [];
  const isUnlocked = id => user?.role==="tenant" && user.data.unlocked?.includes(id);
  const flagged = props.filter(p=>p.flagged);
  const pending = props.filter(p=>p.approved===false);
  const taken = props.filter(p=>p.status==="taken");

  // AUTH
  const doLogin = role => {
    setAuthErr("");
    if(role==="admin"){
      if(authF.email===ADMIN_CREDS.user && authF.password===ADMIN_CREDS.pass){
        setUser({role:"admin",data:{name:"Administrator"}});
        setAuthModal(null); setTab("admin");
        msg("Welcome, Administrator! 👋","ok");
      } else setAuthErr("Invalid admin credentials.");
      return;
    }
    const list = role==="landlord" ? landlords : tenants;
    const u = list.find(x=>x.email===authF.email && x.password===authF.password);
    if(!u){ setAuthErr("Invalid email or password."); return; }
    if(u.banned){ setAuthErr("This account is suspended. Contact support."); return; }
    setUser({role, data:{...u}});
    setAuthModal(null);
    setTab(role==="landlord"?"landlord":"tenant");
    msg(`Welcome back, ${u.name.split(" ")[0]}!`,"ok");
    addLog("User login", `${u.name} (${role})`, "info");
  };

  const doRegister = role => {
    setAuthErr("");
    if(!authF.name||!authF.email||!authF.password){ setAuthErr("All fields are required."); return; }
    if(dirty(authF.name)){ setAuthErr("Name contains inappropriate content."); return; }
    const list = role==="landlord" ? landlords : tenants;
    if(list.find(u=>u.email===authF.email)){ setAuthErr("Email already registered."); return; }
    if(role==="landlord"){
      const nl={id:"L"+Date.now(),name:authF.name,email:authF.email,password:authF.password,phone:"",whatsapp:"",ig:"",fb:"",tt:"",tw:"",banned:false,joined:todayStr()};
      setLandlords(l=>[...l,nl]);
      setUser({role:"landlord",data:nl});
      addLog("Landlord registered", authF.name, "success");
    } else {
      const nt={id:"T"+Date.now(),name:authF.name,email:authF.email,password:authF.password,unlocked:[],banned:false,joined:todayStr()};
      setTenants(t=>[...t,nt]);
      setUser({role:"tenant",data:nt});
      addLog("Tenant registered", authF.name, "success");
    }
    setAuthModal(null);
    setTab(role==="landlord"?"landlord":"tenant");
    msg("Account created! Welcome 🎉","ok");
  };

  const logout = () => { setUser(null); setTab("home"); msg("Signed out.","info"); };

  // PROPERTY CRUD
  const deleteProp = (id, direct=false) => {
    if(direct){
      setProps(p=>p.filter(x=>x.id!==id));
      if(selProp?.id===id) setSelProp(null);
      addLog("Listing deleted",`ID ${id}`,"warn");
      msg("Listing deleted.","warn");
      return;
    }
    setConfModal({type:"delete",title:"Delete Listing",
      msg2:"This listing will be permanently removed.",
      onConfirm:()=>{ deleteProp(id,true); setConfModal(null); }});
  };

  const markTaken = id => {
    const p=props.find(x=>x.id===id);
    setProps(l=>l.map(x=>x.id===id?{...x,status:x.status==="taken"?"available":"taken"}:x));
    addLog("Status changed",`${p?.title} → ${p?.status==="taken"?"Available":"Taken"}`,"info");
    msg(p?.status==="taken"?"↩ Marked Available.":"🏠 Marked Taken — pending admin.","info");
  };

  const adminVerify = id => {
    setProps(l=>l.map(x=>x.id===id?{...x,status:"taken"}:x));
    addLog("Admin verified taken",`ID ${id}`,"success");
    msg("✅ Verified as Taken.","ok");
  };

  const approveProp = id => {
    setProps(l=>l.map(x=>x.id===id?{...x,approved:true,flagged:false}:x));
    addLog("Listing approved",`ID ${id}`,"success");
    msg("✅ Listing approved and live.","ok");
  };

  const flagProp = id => {
    setProps(l=>l.map(x=>x.id===id?{...x,flagged:true,approved:false}:x));
    addLog("Listing flagged",`ID ${id}`,"warn");
    msg("🚩 Listing flagged and hidden.","warn");
  };

  const banUser = (role, id) => {
    const list = role==="landlord" ? landlords : tenants;
    const u = list.find(x=>x.id===id);
    if(role==="landlord") setLandlords(l=>l.map(x=>x.id===id?{...x,banned:!x.banned}:x));
    else setTenants(l=>l.map(x=>x.id===id?{...x,banned:!x.banned}:x));
    addLog(u?.banned?"User unbanned":"User banned",`${u?.name} (${role})`,"warn");
    msg(u?.banned?"↩ User unbanned.":"🚫 User banned.","warn");
    setConfModal(null);
  };

  const addProp = () => {
    if(!form.title||!form.location||!form.rent){ msg("Fill required fields.","warn"); return; }
    if(dirtyObj(form)){ setCwarn(true); msg("❌ Inappropriate content detected.","err"); return; }
    const colors=["#B5451B","#2D5016","#1A1A2E","#7C3A1E","#C4991A","#E05A1E"];
    const tagArr = form.tags?form.tags.split(",").map(t=>t.trim()).filter(Boolean):["New Listing"];
    const np={id:Date.now(),...form,rent:parseInt(form.rent),tags:tagArr,
      color:colors[props.length%colors.length],initials:form.location.slice(0,2).toUpperCase(),
      media:[...pendMedia],landlordId:user.data.id,status:"available",boosted:false,
      flagged:false,approved:!settings.requireApproval,
      contact:{phone:user.data.phone||"",whatsapp:user.data.whatsapp||"",email:user.data.email||"",
        ig:user.data.ig||"",fb:user.data.fb||"",tt:user.data.tt||"",tw:user.data.tw||""}};
    setProps(l=>[np,...l]);
    setForm({title:"",location:"",rent:"",rooms:"",rules:"",type:"Apartment",tags:""});
    setPendMedia([]); setCwarn(false);
    addLog("Listing posted",`${np.title} by ${user.data.name}`,"success");
    msg(settings.requireApproval?"Submitted for review.":"✅ Listing is live!","ok");
    setLdTab("mylistings");
  };

  const saveProfile = () => {
    if(dirty(user.data.name)){ msg("❌ Name contains inappropriate content.","err"); return; }
    setLandlords(l=>l.map(x=>x.id===user.data.id?{...user.data}:x));
    msg("Profile saved!","ok");
  };

  const handleFiles = (files, setter) => {
    Array.from(files).forEach(f=>{
      if(!f.type.startsWith("image/")&&!f.type.startsWith("video/")) return;
      const url=URL.createObjectURL(f);
      (setter||setPendMedia)(l=>[...l,{url,type:f.type.startsWith("video/")?"video":"image",name:f.name}]);
    });
  };

  const simulatePay = () => {
    if(!payModal) return;
    if(payModal.type==="boost"){
      setProps(l=>l.map(x=>x.id===payModal.propId?{...x,boosted:true}:x));
      addLog("Listing boosted",`ID ${payModal.propId} · KSh ${settings.boostFee}`,"payment");
      msg("⭐ Listing boosted to top!","ok");
    } else {
      const nd={...user.data,unlocked:[...(user.data.unlocked||[]),payModal.propId]};
      setUser({...user,data:nd});
      setTenants(l=>l.map(t=>t.id===nd.id?nd:t));
      addLog("Contact unlocked",`${nd.name} · ID ${payModal.propId} · KSh ${settings.unlockFee}`,"payment");
      msg("🔓 Contacts & location unlocked!","ok");
    }
    setPayModal(null);
  };

  const postAnn = () => {
    if(!annF.title||!annF.body){ msg("Fill all fields.","warn"); return; }
    if(dirty(annF.title)||dirty(annF.body)){ msg("❌ Inappropriate content.","err"); return; }
    setAnns(l=>[{id:"A"+Date.now(),...annF,date:todayStr(),active:true},...l]);
    setAnnF({title:"",body:"",type:"success"});
    addLog("Announcement posted",annF.title,"success");
    msg("✅ Announcement published!","ok");
  };

  const adminPostListing = () => {
    if(!admListF.title||!admListF.location||!admListF.rent){ msg("Fill required fields.","warn"); return; }
    if(dirtyObj(admListF)){ msg("❌ Inappropriate content.","err"); return; }
    const colors=["#B5451B","#2D5016","#1A1A2E","#7C3A1E","#C4991A","#E05A1E"];
    const tagArr=admListF.tags?admListF.tags.split(",").map(t=>t.trim()).filter(Boolean):["Admin Featured"];
    const np={id:Date.now(),...admListF,rent:parseInt(admListF.rent),tags:tagArr,
      color:colors[props.length%colors.length],initials:admListF.location.slice(0,2).toUpperCase(),
      media:[...admMedia],landlordId:"ADMIN",status:"available",boosted:true,
      flagged:false,approved:true,
      contact:{phone:"+254 000 000 000",whatsapp:"",email:"admin@househunt.ke",ig:"",fb:"HouseHuntKenya",tt:"",tw:""}};
    setProps(l=>[np,...l]);
    setAdmListF({title:"",location:"",rent:"",rooms:"",type:"Apartment",rules:"",tags:""});
    setAdmMedia([]);
    addLog("Admin posted listing",np.title,"success");
    msg("✅ Admin listing live & boosted!","ok");
  };

  const liveProp = selProp ? props.find(p=>p.id===selProp.id)||selProp : null;
  const canManage = liveProp && (user?.role==="admin"||(user?.role==="landlord"&&liveProp.landlordId===user?.data?.id));
  const activeAnns = anns.filter(a=>a.active);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="hdr">
        <div className="logo" onClick={()=>setTab("home")}>House<em>Hunt</em> Kenya</div>
        <nav className="hnav">
          {[["home","🏠 Home"],["tenant","Find a Home"],["landlord","For Landlords"],["guide","How It Works"]].map(([t,l])=>(
            <button key={t} className={`nb${tab===t?" on":""}`}
              onClick={()=>{if((t==="landlord"||t==="tenant")&&!user){setAuthModal(t);}else setTab(t);}}>
              {l}
            </button>
          ))}
          {user?.role==="admin" && <button className={`nb adm${tab==="admin"?" on":""}`} onClick={()=>setTab("admin")}>⚙️ Admin</button>}
        </nav>
        {user
          ? <div className="userpill">
              <div className={`uav${user.role==="admin"?" adm":""}`}>{user.role==="admin"?"A":user.data.name[0]}</div>
              <span>{user.role==="admin"?"Administrator":user.data.name.split(" ")[0]}</span>
              <button className="sout" onClick={logout}>Sign out</button>
            </div>
          : <div style={{display:"flex",gap:5}}>
              <button className="bghost" style={{fontSize:"0.74rem",padding:"5px 12px"}} onClick={()=>setAuthModal("tenant")}>Tenant Login</button>
              <button className="bp" style={{fontSize:"0.74rem",padding:"5px 12px"}} onClick={()=>setAuthModal("landlord")}>Landlord Login</button>
            </div>
        }
      </header>

      {/* ANN BAR */}
      {activeAnns.length>0 && tab!=="admin" && (
        <div className="annbar">
          {activeAnns.map(a=>(
            <div key={a.id} className={`anntag at-${a.type}`}>
              {a.type==="success"?"🎉":a.type==="info"?"📢":"⚠️"} {a.title}: {a.body}
            </div>
          ))}
        </div>
      )}

      {/* ─── HOME ─── */}
      {tab==="home" && <>
        <div className="hero">
          <div className="hero-in">
            <div className="htag">🏡 Kenya's Premier Property Platform</div>
            <h1 className="h1">Find Your <em>Perfect Home</em><br/>Across Kenya</h1>
            <p className="hsub">Verified listings across Nairobi, Mombasa, Kisumu & beyond. Connect directly with landlords.</p>
            <div className="hbtns">
              <button className="bp" onClick={()=>user?.role==="tenant"?setTab("tenant"):setAuthModal("tenant")}>Browse Listings →</button>
              <button className="bo" onClick={()=>user?.role==="landlord"?setTab("landlord"):setAuthModal("landlord")}>List Your Property</button>
              {!user && <button className="bo" style={{borderColor:"rgba(196,153,26,0.4)",color:"#C4991A"}} onClick={()=>setAuthModal("admin")}>Admin Login</button>}
            </div>
            <p className="hnote">✓ Free to browse · ✓ Free to list · 🔓 Unlock contacts KSh {settings.unlockFee}</p>
          </div>
        </div>
        <div className="statsbar">
          <div className="stitem"><span className="stnum">{props.filter(p=>p.approved!==false).length}+</span><span className="stlbl">Listings</span></div>
          <div className="stitem"><span className="stnum">{props.filter(p=>p.status==="available"&&p.approved!==false).length}</span><span className="stlbl">Available</span></div>
          <div className="stitem"><span className="stnum">{landlords.length}</span><span className="stlbl">Landlords</span></div>
          <div className="stitem"><span className="stnum">12</span><span className="stlbl">Cities</span></div>
        </div>
        <div className="page">
          <div className="sh"><div className="shey">Featured & Boosted</div><div className="shtt">Top Listings This Week</div></div>
          <div className="pgrid">
            {sorted.filter(p=>p.boosted).slice(0,3).map(p=><PropCard key={p.id} p={p} onView={p=>{setSelProp(p);setMidx(0);}} user={user} onDel={deleteProp}/>)}
          </div>
        </div>
      </>}

      {/* ─── TENANT BROWSE ─── */}
      {tab==="tenant" && (
        <div className="page">
          {!user && <div className="guestbanner"><p><strong>🔒 Guest mode.</strong> Contacts & locations are hidden. Login free to browse.</p><button className="bp" style={{fontSize:"0.78rem",padding:"7px 16px"}} onClick={()=>setAuthModal("tenant")}>Login / Sign Up Free</button></div>}
          <div className="sh"><div className="shey">Browse listings</div><div className="shtt">Find Your Home</div></div>
          <div className="sbar">
            <input placeholder="🔍 Search location or name…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select value={budget} onChange={e=>setBudget(e.target.value)}>
              <option value="">Any Budget</option>
              <option value="low">Below KSh 15,000</option>
              <option value="mid">KSh 15,000 – 35,000</option>
              <option value="high">Above KSh 35,000</option>
            </select>
            <select value={ptype} onChange={e=>setPtype(e.target.value)}>
              <option value="">Any Type</option>
              {["Bedsitter","Room","Apartment","House","Penthouse"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          {filtered.length===0
            ? <div className="noresult"><h3>No listings found</h3><p>Try adjusting your filters.</p></div>
            : <div className="pgrid">{filtered.map(p=><PropCard key={p.id} p={p} onView={p=>{setSelProp(p);setMidx(0);}} user={user} onDel={deleteProp}/>)}</div>}
        </div>
      )}

      {/* ─── LANDLORD DASHBOARD ─── */}
      {tab==="landlord" && user?.role==="landlord" && (
        <div className="page">
          <div className="sh"><div className="shey">Property Owner</div><div className="shtt">Landlord Dashboard</div></div>
          <div className="dlayout">
            <div className="dside">
              <div className="dshead">
                <div className="dav">{user.data.name[0]}</div>
                <div className="duname">{user.data.name}</div>
                <div className="durole">Property Owner</div>
              </div>
              <div className="dsnav">
                {[["profile","👤","My Profile"],["social","📱","Contact & Socials"],["media","🖼️","Upload Media"],["listing","🏠","Add Listing"],["mylistings","📋","My Listings"]].map(([k,ic,lb])=>(
                  <button key={k} className={`snb${ldTab===k?" on":""}`} onClick={()=>setLdTab(k)}>
                    <span className="snbi">{ic}</span>{lb}
                    {k==="mylistings"&&myProps.length>0&&<span className="snbc">{myProps.length}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {ldTab==="profile" && <div className="fcard">
                <h3>My Profile</h3><p className="sub">Your public display name on all listings.</p>
                <div className="fg"><label>Display Name</label><input value={user.data.name} onChange={e=>setUser(u=>({...u,data:{...u.data,name:e.target.value}}))} /></div>
                <button className="bp" onClick={saveProfile}>Save Profile →</button>
              </div>}

              {ldTab==="social" && <div className="fcard">
                <h3>Contact & Social Media</h3><p className="sub">Shown on listings so tenants can reach you directly.</p>
                <div className="divlbl"><span>📞 Phone Numbers</span></div>
                <div className="frow">
                  <div className="fg"><label>Primary Phone</label><div className="inpw"><span className="inpx">🇰🇪</span><input placeholder="+254 712 345 678" value={user.data.phone||""} onChange={e=>setUser(u=>({...u,data:{...u.data,phone:e.target.value}}))} /></div></div>
                  <div className="fg"><label>WhatsApp</label><div className="inpw"><span className="inpx">💬</span><input placeholder="+254712345678" value={user.data.whatsapp||""} onChange={e=>setUser(u=>({...u,data:{...u.data,whatsapp:e.target.value}}))} /></div></div>
                </div>
                <div className="fg"><label>Email</label><div className="inpw"><span className="inpx">✉️</span><input type="email" placeholder="you@example.com" value={user.data.email||""} onChange={e=>setUser(u=>({...u,data:{...u.data,email:e.target.value}}))} /></div></div>
                <div className="divlbl"><span>📱 Social Media</span></div>
                <div className="frow">
                  <div className="fg"><label>Instagram</label><div className="inpw"><span className="inpx">📸 @</span><input placeholder="handle" value={user.data.ig||""} onChange={e=>setUser(u=>({...u,data:{...u.data,ig:e.target.value}}))} /></div></div>
                  <div className="fg"><label>Facebook</label><div className="inpw"><span className="inpx">👍</span><input placeholder="page name" value={user.data.fb||""} onChange={e=>setUser(u=>({...u,data:{...u.data,fb:e.target.value}}))} /></div></div>
                </div>
                <div className="frow">
                  <div className="fg"><label>TikTok</label><div className="inpw"><span className="inpx">🎵 @</span><input placeholder="handle" value={user.data.tt||""} onChange={e=>setUser(u=>({...u,data:{...u.data,tt:e.target.value}}))} /></div></div>
                  <div className="fg"><label>X / Twitter</label><div className="inpw"><span className="inpx">𝕏 @</span><input placeholder="handle" value={user.data.tw||""} onChange={e=>setUser(u=>({...u,data:{...u.data,tw:e.target.value}}))} /></div></div>
                </div>
                {(user.data.phone||user.data.ig) && <div className="pprev"><h4>Live Preview</h4>
                  <div className="cchips">
                    {user.data.phone&&<div className="cchip">📞 {user.data.phone}</div>}
                    {user.data.whatsapp&&<div className="cchip">💬 WhatsApp</div>}
                    {user.data.email&&<div className="cchip">✉️ {user.data.email}</div>}
                  </div>
                  <div className="schips">
                    {user.data.ig&&<span className="sc sc-ig">📸 @{user.data.ig}</span>}
                    {user.data.fb&&<span className="sc sc-fb">👍 {user.data.fb}</span>}
                    {user.data.tt&&<span className="sc sc-tt">🎵 @{user.data.tt}</span>}
                    {user.data.tw&&<span className="sc sc-tw">𝕏 @{user.data.tw}</span>}
                  </div>
                </div>}
                <button className="bp" onClick={saveProfile}>Save Contact Info →</button>
              </div>}

              {ldTab==="media" && <div className="fcard">
                <h3>Upload Photos & Videos</h3><p className="sub">Attached automatically to your next listing.</p>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
                <div className={`upzone${dragOv?" ov":""}`}
                  onClick={()=>fileRef.current.click()}
                  onDragOver={e=>{e.preventDefault();setDragOv(true);}}
                  onDragLeave={()=>setDragOv(false)}
                  onDrop={e=>{e.preventDefault();setDragOv(false);handleFiles(e.dataTransfer.files);}}>
                  <div className="upicon">📷</div><h4>Drag & Drop or Click to Upload</h4><p>Photos and short video tours</p>
                  <div className="uptypes">{["JPG","PNG","MP4","MOV","Max 50MB"].map(t=><span key={t} className="utb">{t}</span>)}</div>
                </div>
                {pendMedia.length>0 && <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"1rem"}}>
                    <p style={{fontWeight:600,fontSize:"0.84rem"}}>{pendMedia.length} file{pendMedia.length>1?"s":""} ready</p>
                    <button style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"0.74rem",fontWeight:700,fontFamily:"Inter,sans-serif"}} onClick={()=>setPendMedia([])}>Clear all</button>
                  </div>
                  <div className="mgrid">{pendMedia.map((m,i)=>(
                    <div key={i} className="mitem">
                      {m.type==="image"?<img src={m.url} alt=""/>:<video src={m.url} muted loop/>}
                      <button className="mrm" onClick={()=>setPendMedia(l=>l.filter((_,j)=>j!==i))}>✕</button>
                      <span className="mtlbl">{m.type==="video"?"🎬":"📸"}</span>
                    </div>
                  ))}</div>
                </>}
              </div>}

              {ldTab==="listing" && <div className="fcard">
                <h3>Add New Listing</h3>
                <p className="sub">Free to post. Pay KSh {settings.boostFee} to boost to the top. {pendMedia.length>0 && `${pendMedia.length} media file(s) ready.`}</p>
                {cwarn && <div className="cwarn"><p>⚠️ Your content contains inappropriate language. Please revise before submitting.</p></div>}
                <div className="frow">
                  <div className="fg"><label>Property Title *</label><input placeholder="e.g. 2 Bedroom in Westlands" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setCwarn(false);}}/></div>
                  <div className="fg"><label>Location *</label><input placeholder="Westlands, Nairobi" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></div>
                </div>
                <div className="frow">
                  <div className="fg"><label>Monthly Rent (KES) *</label><input type="number" placeholder="25000" value={form.rent} onChange={e=>setForm({...form,rent:e.target.value})}/></div>
                  <div className="fg"><label>Property Type</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{["Bedsitter","Room","Apartment","House","Penthouse"].map(t=><option key={t}>{t}</option>)}</select></div>
                </div>
                <div className="fg"><label>Bedrooms & Facilities</label><input placeholder="2 Bed · 1 Bath · DSQ" value={form.rooms} onChange={e=>setForm({...form,rooms:e.target.value})}/></div>
                <div className="fg"><label>Amenity Tags (comma-separated)</label><input placeholder="WiFi, Parking, Security" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/></div>
                <div className="fg"><label>House Rules</label><textarea placeholder="No pets. 2 months deposit." value={form.rules} onChange={e=>{setForm({...form,rules:e.target.value});setCwarn(false);}}/></div>
                {pendMedia.length>0 && <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>{pendMedia.slice(0,5).map((m,i)=>(
                  <div key={i} style={{width:50,height:38,borderRadius:6,overflow:"hidden",border:"1px solid rgba(181,69,27,0.18)"}}>
                    {m.type==="image"?<img src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}} muted/>}
                  </div>
                ))}{pendMedia.length>5&&<div style={{width:50,height:38,borderRadius:6,background:"rgba(10,10,24,0.07)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.68rem",color:"#bbb"}}>+{pendMedia.length-5}</div>}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="bp" style={{flex:1,padding:"12px"}} onClick={addProp}>Post Listing Free →</button>
                  <button className="bboost" onClick={()=>msg("Post your listing first, then boost from My Listings.","info")}>⭐ KSh {settings.boostFee} Boost</button>
                </div>
              </div>}

              {ldTab==="mylistings" && <div className="fcard">
                <h3>My Listings</h3><p className="sub">{myProps.length} listing{myProps.length!==1?"s":""}.</p>
                {myProps.length===0 && <p style={{color:"#bbb",textAlign:"center",padding:"2rem"}}>No listings yet. Go to Add Listing.</p>}
                {myProps.map(p=>(
                  <div key={p.id} className="lrow">
                    <div className="lclr" style={{background:p.color}}>{p.initials}</div>
                    <div className="linfo">
                      <div className="ltitle">{p.title}</div>
                      <div className="lmeta">📍 {p.location} · {p.type} · {p.media?.length||0} media{p.approved===false?" · ⏳ Pending":""}</div>
                    </div>
                    <div className="lacts">
                      <span className={`sbadge sb-${p.status==="available"?"av":"tk"}`}>{p.status==="available"?"✓ Available":"⊘ Taken"}</span>
                      <div className="lrent">{KES(p.rent)}</div>
                      {!p.boosted && <button className="bboost" onClick={()=>setPayModal({type:"boost",propId:p.id})}>⭐ Boost</button>}
                      {p.boosted && <span style={{fontSize:"0.66rem",color:"#C4991A",fontWeight:700}}>⭐ Boosted</span>}
                      <button className="bver" onClick={()=>markTaken(p.id)}>{p.status==="taken"?"↩ Unmark":"🏠 Mark Taken"}</button>
                      <button className="bdel" onClick={()=>deleteProp(p.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        </div>
      )}
      {tab==="landlord" && !user && <div className="page" style={{textAlign:"center",padding:"5rem 2rem"}}>
        <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"2rem",marginBottom:"1rem"}}>Landlord Dashboard</h2>
        <p style={{color:"#bbb",marginBottom:"1.5rem"}}>Log in to manage your listings.</p>
        <button className="bp" onClick={()=>setAuthModal("landlord")}>Login / Sign Up Free →</button>
      </div>}

      {/* ─── ADMIN PANEL ─── */}
      {tab==="admin" && user?.role==="admin" && (
        <div className="admin-wrap">
          <div className="admin-topbar">
            <span style={{fontSize:"1.2rem"}}>⚙️</span>
            <div>
              <div className="atb-title">HouseHunt Kenya — Admin Control Centre</div>
              <div className="atb-sub">Full control over listings, users, content & site settings.</div>
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
                <div className="dsnav">
                  {[
                    ["overview","📊","Overview"],
                    ["listings","🏠","All Listings",props.length],
                    ["flagged","🚩","Flagged",flagged.length],
                    ["pending","⏳","Pending",pending.length],
                    ["verify","✅","Verify Taken",taken.length],
                    ["users","👥","Users"],
                    ["announce","📢","Announcements"],
                    ["post","➕","Post New Listing"],
                    ["settings","⚙️","Site Settings"],
                    ["activity","📋","Activity Log"],
                  ].map(([k,ic,lb,cnt])=>(
                    <button key={k} className={`snb${adTab===k?" on":""}`} onClick={()=>setAdTab(k)}>
                      <span className="snbi">{ic}</span>{lb}
                      {cnt>0 && <span className="snbc">{cnt}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {/* OVERVIEW */}
                {adTab==="overview" && <div className="atab">
                  <h3>Platform Overview</h3><p className="sub">Live snapshot of HouseHunt Kenya.</p>
                  <div className="akpis">
                    <div className="akpi"><div className="akpi-icon">🏠</div><div className="akpi-val">{props.length}</div><div className="akpi-lbl">Total Listings</div></div>
                    <div className="akpi"><div className="akpi-icon">✓</div><div className="akpi-val grn">{props.filter(p=>p.status==="available").length}</div><div className="akpi-lbl">Available</div></div>
                    <div className="akpi"><div className="akpi-icon">⊘</div><div className="akpi-val red">{props.filter(p=>p.status==="taken").length}</div><div className="akpi-lbl">Taken</div></div>
                    <div className="akpi"><div className="akpi-icon">⭐</div><div className="akpi-val">{props.filter(p=>p.boosted).length}</div><div className="akpi-lbl">Boosted</div></div>
                    <div className="akpi"><div className="akpi-icon">🚩</div><div className="akpi-val red">{flagged.length}</div><div className="akpi-lbl">Flagged</div></div>
                    <div className="akpi"><div className="akpi-icon">👷</div><div className="akpi-val blu">{landlords.length}</div><div className="akpi-lbl">Landlords</div></div>
                    <div className="akpi"><div className="akpi-icon">👤</div><div className="akpi-val blu">{tenants.length}</div><div className="akpi-lbl">Tenants</div></div>
                    <div className="akpi"><div className="akpi-icon">📢</div><div className="akpi-val">{activeAnns.length}</div><div className="akpi-lbl">Announcements</div></div>
                  </div>
                  <h3 style={{color:"#C4991A",marginBottom:"0.4rem",fontSize:"1.2rem"}}>Recent Activity</h3>
                  <div className="actlog">
                    {log.slice(0,8).map(a=>(
                      <div key={a.id} className="actrow">
                        <div className={`actdot ${a.kind}`}/><span className="actt">{a.time}</span>
                        <span className="acta">{a.action}</span><span className="actd">— {a.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>}

                {/* ALL LISTINGS */}
                {adTab==="listings" && <div className="atab">
                  <h3>All Listings</h3><p className="sub">Approve, flag, or delete any listing on the platform.</p>
                  {props.length===0 && <div className="empty-adm"><p>No listings yet.</p></div>}
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
                  {flagged.length===0 && <div className="empty-adm"><p>✅ No flagged content. Platform is clean.</p></div>}
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
                  {pending.length===0 && <div className="empty-adm"><p>✅ No listings awaiting approval.</p></div>}
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
                  {taken.length===0 && <div className="empty-adm"><p>No listings marked as taken yet.</p></div>}
                  {taken.map(p=>(
                    <div key={p.id} className="arow" style={{borderLeft:"3px solid #dc2626"}}>
                      <div className="arow-icon" style={{background:p.color}}>{p.initials}</div>
                      <div className="arow-info"><div className="arow-title">{p.title}</div><div className="arow-meta">📍 {p.location} · Marked taken by landlord</div></div>
                      <div className="arow-acts">
                        <span className="sbadge sb-tk">⊘ Taken</span>
                        <button className="bapp" onClick={()=>{adminVerify(p.id);}}>✅ Verify & Finalise</button>
                        <button className="bghost" style={{fontSize:"0.72rem",padding:"5px 11px",color:"#C4991A",borderColor:"rgba(196,153,26,0.3)"}} onClick={()=>{setProps(l=>l.map(x=>x.id===p.id?{...x,status:"available"}:x));msg("↩ Restored to Available.","info");}}>↩ Reject</button>
                        <button className="bdel" onClick={()=>deleteProp(p.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* USERS */}
                {adTab==="users" && <div className="atab">
                  <h3>Manage Users</h3><p className="sub">Ban, restore, or review all landlords and tenants.</p>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Landlords ({landlords.length})</span></div>
                  {landlords.map(l=>(
                    <div key={l.id} className="arow">
                      <div className="dav" style={{width:38,height:38,fontSize:"0.95rem",flexShrink:0,borderRadius:"50%",background:"#B5451B",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Cormorant Garamond,serif",fontWeight:700}}>{l.name[0]}</div>
                      <div className="arow-info"><div className="arow-title">{l.name}</div><div className="arow-meta">{l.email} · {props.filter(p=>p.landlordId===l.id).length} listings · Joined {l.joined}</div></div>
                      <div className="arow-acts">
                        {l.banned && <span className="sbadge sb-bn">🚫 Banned</span>}
                        <button className={l.banned?"bapp":"bban"} onClick={()=>setConfModal({type:"ban",title:l.banned?"Unban User":"Ban User",msg2:l.banned?`Restore access for ${l.name}?`:`Ban ${l.name}? They cannot log in.`,onConfirm:()=>banUser("landlord",l.id)})}>{l.banned?"↩ Unban":"🚫 Ban"}</button>
                      </div>
                    </div>
                  ))}
                  <div className="divlbl" style={{marginTop:"1.3rem"}}><span style={{color:"#C4991A"}}>Tenants ({tenants.length})</span></div>
                  {tenants.map(t=>(
                    <div key={t.id} className="arow">
                      <div style={{width:38,height:38,borderRadius:"50%",background:"#2D5016",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Cormorant Garamond,serif",fontWeight:700,fontSize:"0.95rem",flexShrink:0}}>{t.name[0]}</div>
                      <div className="arow-info"><div className="arow-title">{t.name}</div><div className="arow-meta">{t.email} · {t.unlocked?.length||0} unlocked · Joined {t.joined}</div></div>
                      <div className="arow-acts">
                        {t.banned && <span className="sbadge sb-bn">🚫 Banned</span>}
                        <button className={t.banned?"bapp":"bban"} onClick={()=>setConfModal({type:"ban",title:t.banned?"Unban User":"Ban User",msg2:t.banned?`Restore access for ${t.name}?`:`Ban ${t.name}?`,onConfirm:()=>banUser("tenant",t.id)})}>{t.banned?"↩ Unban":"🚫 Ban"}</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* ANNOUNCEMENTS */}
                {adTab==="announce" && <div className="atab">
                  <h3>Announcements & Banners</h3><p className="sub">Platform-wide notices shown to all users on every page.</p>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>New Announcement</span></div>
                  <div className="fg admin-fg"><label>Title</label><input placeholder="e.g. New listings in Kisumu!" value={annF.title} onChange={e=>setAnnF({...annF,title:e.target.value})}/></div>
                  <div className="fg admin-fg"><label>Message</label><textarea placeholder="Full announcement text..." value={annF.body} onChange={e=>setAnnF({...annF,body:e.target.value})}/></div>
                  <div style={{marginBottom:"1rem"}}>
                    <div style={{fontSize:"0.68rem",fontWeight:700,color:"rgba(196,153,26,0.7)",textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:"6px"}}>Type</div>
                    <div className="ann-type-row">
                      {["success","info","warning"].map(t=>(
                        <button key={t} className={`attbtn ${t}${annF.type===t?" sel":""}`} onClick={()=>setAnnF({...annF,type:t})}>{t==="success"?"🎉 News":t==="info"?"📢 Info":"⚠️ Warning"}</button>
                      ))}
                    </div>
                  </div>
                  <button className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)",marginBottom:"1.5rem"}} onClick={postAnn}>📢 Publish Announcement</button>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Active ({activeAnns.length})</span></div>
                  {anns.length===0 && <div className="empty-adm"><p>No announcements yet.</p></div>}
                  {anns.map(a=>(
                    <div key={a.id} className="arow">
                      <div style={{fontSize:"1.4rem",flexShrink:0}}>{a.type==="success"?"🎉":a.type==="info"?"📢":"⚠️"}</div>
                      <div className="arow-info"><div className="arow-title">{a.title}</div><div className="arow-meta">{a.body.slice(0,60)}… · {a.date}</div></div>
                      <div className="arow-acts">
                        <span className={`sbadge ${a.active?"sb-bo":"sb-tk"}`}>{a.active?"Live":"Hidden"}</span>
                        <button className={a.active?"bban":"bapp"} onClick={()=>{setAnns(l=>l.map(x=>x.id===a.id?{...x,active:!x.active}:x));msg(a.active?"Announcement hidden.":"Restored.","info");}}>{a.active?"Hide":"Show"}</button>
                        <button className="bdel" onClick={()=>{setAnns(l=>l.filter(x=>x.id!==a.id));msg("Deleted.","warn");}}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* POST NEW LISTING */}
                {adTab==="post" && <div className="atab">
                  <h3>Post New Listing</h3><p className="sub">Admin listings are auto-approved and boosted to the top.</p>
                  <input ref={admFileRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files,setAdmMedia)}/>
                  <div className="frow">
                    <div className="fg admin-fg"><label>Title *</label><input placeholder="Premium 3BR in Kilimani" value={admListF.title} onChange={e=>setAdmListF({...admListF,title:e.target.value})}/></div>
                    <div className="fg admin-fg"><label>Location *</label><input placeholder="Kilimani, Nairobi" value={admListF.location} onChange={e=>setAdmListF({...admListF,location:e.target.value})}/></div>
                  </div>
                  <div className="frow">
                    <div className="fg admin-fg"><label>Monthly Rent (KES) *</label><input type="number" placeholder="30000" value={admListF.rent} onChange={e=>setAdmListF({...admListF,rent:e.target.value})}/></div>
                    <div className="fg admin-fg"><label>Type</label>
                      <select value={admListF.type} onChange={e=>setAdmListF({...admListF,type:e.target.value})} style={{background:"rgba(255,255,255,0.06)",color:"#F5E6C8"}}>
                        {["Bedsitter","Room","Apartment","House","Penthouse"].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="fg admin-fg"><label>Rooms & Facilities</label><input placeholder="3 Bed · 2 Bath" value={admListF.rooms} onChange={e=>setAdmListF({...admListF,rooms:e.target.value})}/></div>
                  <div className="fg admin-fg"><label>Tags (comma-separated)</label><input placeholder="WiFi, Pool, Parking" value={admListF.tags} onChange={e=>setAdmListF({...admListF,tags:e.target.value})}/></div>
                  <div className="fg admin-fg"><label>House Rules</label><textarea placeholder="No pets. 2 months deposit." value={admListF.rules} onChange={e=>setAdmListF({...admListF,rules:e.target.value})}/></div>
                  <div style={{marginBottom:"1rem"}}>
                    <button className="bghost" style={{color:"#C4991A",borderColor:"rgba(196,153,26,0.28)",marginBottom:"0.7rem"}} onClick={()=>admFileRef.current.click()}>📷 Upload Photos & Videos</button>
                    {admMedia.length>0 && <div className="mgrid">{admMedia.map((m,i)=>(
                      <div key={i} className="mitem">
                        {m.type==="image"?<img src={m.url} alt=""/>:<video src={m.url} muted loop/>}
                        <button className="mrm" onClick={()=>setAdmMedia(l=>l.filter((_,j)=>j!==i))}>✕</button>
                        <span className="mtlbl">{m.type==="video"?"🎬":"📸"}</span>
                      </div>
                    ))}</div>}
                  </div>
                  <button className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)",width:"100%",padding:"12px"}} onClick={adminPostListing}>🏠 Post & Auto-Boost →</button>
                </div>}

                {/* SETTINGS */}
                {adTab==="settings" && <div className="atab">
                  <h3>Site Settings</h3><p className="sub">Control platform-wide behaviour, pricing, and moderation.</p>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Pricing</span></div>
                  <div className="frow">
                    <div className="fg admin-fg"><label>Boost Fee (KES)</label><input type="number" value={settings.boostFee} onChange={e=>setSettings({...settings,boostFee:parseInt(e.target.value)||200})}/></div>
                    <div className="fg admin-fg"><label>Unlock Fee (KES)</label><input type="number" value={settings.unlockFee} onChange={e=>setSettings({...settings,unlockFee:parseInt(e.target.value)||100})}/></div>
                  </div>
                  <div className="divlbl"><span style={{color:"#C4991A"}}>Moderation</span></div>
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <div className="toggle-label">Require Admin Approval for New Listings</div>
                      <div className="toggle-desc">When ON, all new listings must be approved before going live.</div>
                    </div>
                    <div className="toggle" style={{background:settings.requireApproval?"#C4991A":"rgba(255,255,255,0.1)"}} onClick={()=>setSettings(s=>({...s,requireApproval:!s.requireApproval}))}>
                      <div className="toggle-knob" style={{left:settings.requireApproval?"24px":"3px"}}/>
                    </div>
                  </div>
                  <div className="mod-notice">
                    <p>🛡️ Content Moderation (Always Active)</p>
                    <p>Automatic profanity and inappropriate content filter runs on all text inputs. Listings with banned words are automatically blocked. {BANNED.length} banned terms monitored continuously.</p>
                  </div>
                  <button className="bp" style={{background:"linear-gradient(135deg,#C4991A,#e8a800)",boxShadow:"0 3px 14px rgba(196,153,26,0.3)"}} onClick={()=>msg("✅ Settings saved!","ok")}>Save Settings →</button>
                </div>}

                {/* ACTIVITY LOG */}
                {adTab==="activity" && <div className="atab">
                  <h3>Activity Log</h3><p className="sub">Full audit trail of all platform actions.</p>
                  <div className="actlog">
                    {log.length===0 && <div className="empty-adm"><p>No activity yet.</p></div>}
                    {log.map(a=>(
                      <div key={a.id} className="actrow">
                        <div className={`actdot ${a.kind}`}/><span className="actt">{a.time}</span>
                        <span className="acta">{a.action}</span><span className="actd">— {a.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
            </div>
          </div>
        </div>
      )}
      {tab==="admin" && !user && <div className="page" style={{textAlign:"center",padding:"5rem 2rem"}}>
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
            {n:"02",t:"Unlock Contacts",d:`Pay KSh ${settings.unlockFee} via M-PESA to reveal the exact location and landlord contact details for any listing.`},
            {n:"03",t:"Free Landlord Listing",d:"Landlords sign up and list properties for free with photos, videos, contact info, and social media links."},
            {n:"04",t:"Boost Your Listing",d:`Pay KSh ${settings.boostFee} to pin your listing at the very top of all search results for 30 days.`},
            {n:"05",t:"Verify Availability",d:"Landlords mark listings as taken. Admin verifies and finalises to prevent double-bookings and collisions."},
            {n:"06",t:"Safe Platform",d:"Auto content moderation blocks profanity and inappropriate content. Admins flag and remove violations instantly."},
          ].map(s=>(
            <div key={s.n} className="gcard">
              <div className="gnum">{s.n}</div><h4>{s.t}</h4><p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>}

      {/* ─── PROPERTY MODAL ─── */}
      {liveProp && (
        <div className="mov" onClick={e=>e.target===e.currentTarget&&setSelProp(null)}>
          <div className="mdl">
            <div className="mhero" style={{background:`linear-gradient(135deg,${liveProp.color}cc,${liveProp.color}77)`}}>
              {liveProp.media?.length>0 && (liveProp.media[midx]?.type==="video"
                ?<video src={liveProp.media[midx].url} autoPlay muted loop/>
                :<img src={liveProp.media[midx].url} alt=""/>)}
              <div className="mhero-ov"/><span className="mhero-init">{liveProp.initials}</span>
              {canManage && <button className="bdel" style={{position:"absolute",top:12,left:12,zIndex:10}} onClick={()=>deleteProp(liveProp.id)}>🗑 Delete</button>}
              <button className="mclose" onClick={()=>setSelProp(null)}>✕</button>
            </div>
            {liveProp.media?.length>1 && <div className="thumbrow">{liveProp.media.map((m,i)=>(
              <div key={i} className={`thumb${midx===i?" on":""}`} onClick={()=>setMidx(i)}>
                {m.type==="image"?<img src={m.url} alt=""/>:<video src={m.url} muted/>}
              </div>
            ))}</div>}
            <div className="mbody">
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                <span style={{fontSize:"0.66rem",color:"var(--rust)",textTransform:"uppercase",letterSpacing:"1px",fontWeight:700}}>{liveProp.type}</span>
                <span className={`sbadge sb-${liveProp.status==="available"?"av":"tk"}`}>{liveProp.status==="available"?"✓ Available":"⊘ Taken"}</span>
                {liveProp.boosted && <span style={{fontSize:"0.66rem",color:"#C4991A",fontWeight:700}}>⭐ Boosted</span>}
                {liveProp.flagged && <span style={{fontSize:"0.66rem",color:"#dc2626",fontWeight:700}}>🚩 Flagged</span>}
              </div>
              <h2>{liveProp.title}</h2>
              {(user?.role!=="tenant"||isUnlocked(liveProp.id))
                ?<p style={{color:"#7C3A1E",fontSize:"0.82rem",marginTop:4}}>📍 {liveProp.location}</p>
                :<p style={{color:"#bbb",fontSize:"0.82rem",marginTop:4}}>📍 Location hidden — unlock to view</p>}
              <div className="mdets">
                <div className="mdet"><div className="mdet-l">Monthly Rent</div><div className="mdet-v" style={{color:"var(--rust)"}}>{KES(liveProp.rent)}</div></div>
                <div className="mdet"><div className="mdet-l">Rooms</div><div className="mdet-v">{liveProp.rooms}</div></div>
                <div className="mdet"><div className="mdet-l">Media</div><div className="mdet-v">{liveProp.media?.length||0} files</div></div>
              </div>
              <div className="tags" style={{marginBottom:"1rem"}}>{liveProp.tags.map(t=><span key={t} className="tag">{t}</span>)}</div>
              <div className="mrules"><strong>House Rules</strong>{liveProp.rules}</div>

              {/* VERIFY — landlord + admin only */}
              {canManage && <div className="vsec">
                <h4>🏠 Availability Management</h4>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button className="bver" onClick={()=>{markTaken(liveProp.id);setSelProp(null);}}>{liveProp.status==="taken"?"↩ Mark Available":"🏠 Mark Taken"}</button>
                  {user?.role==="admin" && liveProp.status==="taken" && <button className="bp" style={{padding:"6px 14px",fontSize:"0.78rem"}} onClick={()=>{adminVerify(liveProp.id);setSelProp(null);}}>✅ Admin Verify</button>}
                  {user?.role==="admin" && !liveProp.flagged && <button className="bban" onClick={()=>{flagProp(liveProp.id);setSelProp(null);}}>🚩 Flag</button>}
                  {user?.role==="admin" && liveProp.flagged && <button className="bapp" onClick={()=>{approveProp(liveProp.id);setSelProp(null);}}>✓ Restore</button>}
                </div>
              </div>}

              {/* CONTACT SECTION */}
              {user?.role==="tenant" && !isUnlocked(liveProp.id) && (
                <div className="locked">
                  <div className="li">🔒</div>
                  <h4>Contact & Location Locked</h4>
                  <p>Unlock to see the exact address and landlord contact details.</p>
                  <button className="bunlock" onClick={()=>setPayModal({type:"unlock",propId:liveProp.id})}>🔓 Unlock for KSh {settings.unlockFee} via M-PESA</button>
                </div>
              )}
              {user?.role==="tenant" && isUnlocked(liveProp.id) && liveProp.contact && (
                <div className="mcbox">
                  <h4>Contact the Landlord <span className="ulpill">🔓 Unlocked</span></h4>
                  <div className="cgrid">
                    {liveProp.contact.phone&&<a className="citem" href={`tel:${liveProp.contact.phone}`}>📞 {liveProp.contact.phone}</a>}
                    {liveProp.contact.email&&<a className="citem" href={`mailto:${liveProp.contact.email}`}>✉️ {liveProp.contact.email}</a>}
                    {liveProp.contact.whatsapp&&<a className="citem" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                  </div>
                  <div className="srow">
                    {liveProp.contact.whatsapp&&<a className="sbtn sb-wa" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                    {liveProp.contact.ig&&<a className="sbtn sb-ig" href={`https://instagram.com/${liveProp.contact.ig}`} target="_blank" rel="noreferrer">📸 Instagram</a>}
                    {liveProp.contact.fb&&<a className="sbtn sb-fb" href={`https://facebook.com/${liveProp.contact.fb}`} target="_blank" rel="noreferrer">👍 Facebook</a>}
                  </div>
                </div>
              )}
              {user?.role!=="tenant" && liveProp.contact && (liveProp.contact.phone||liveProp.contact.whatsapp) && (
                <div className="mcbox">
                  <h4>Contact the Landlord</h4>
                  <div className="cgrid">
                    {liveProp.contact.phone&&<a className="citem" href={`tel:${liveProp.contact.phone}`}>📞 {liveProp.contact.phone}</a>}
                    {liveProp.contact.email&&<a className="citem" href={`mailto:${liveProp.contact.email}`}>✉️ {liveProp.contact.email}</a>}
                    {liveProp.contact.whatsapp&&<a className="citem" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                  </div>
                  <div className="srow">
                    {liveProp.contact.whatsapp&&<a className="sbtn sb-wa" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                    {liveProp.contact.ig&&<a className="sbtn sb-ig" href={`https://instagram.com/${liveProp.contact.ig}`} target="_blank" rel="noreferrer">📸 Instagram</a>}
                    {liveProp.contact.fb&&<a className="sbtn sb-fb" href={`https://facebook.com/${liveProp.contact.fb}`} target="_blank" rel="noreferrer">👍 Facebook</a>}
                    {liveProp.contact.tt&&<a className="sbtn sb-tt" href={`https://tiktok.com/@${liveProp.contact.tt}`} target="_blank" rel="noreferrer">🎵 TikTok</a>}
                    {liveProp.contact.tw&&<a className="sbtn sb-tw" href={`https://twitter.com/${liveProp.contact.tw}`} target="_blank" rel="noreferrer">𝕏 Twitter</a>}
                  </div>
                </div>
              )}
              {!user && <div className="locked">
                <div className="li">🔒</div><h4>Login to View Contacts</h4>
                <p>Create a free tenant account. Pay KSh {settings.unlockFee} to unlock contacts.</p>
                <button className="bp" style={{marginTop:0}} onClick={()=>{setSelProp(null);setAuthModal("tenant");}}>Login / Sign Up Free →</button>
              </div>}
              {user?.role==="tenant" && liveProp.status!=="taken" && (
                <button className="maincbtn" style={{marginTop:"1rem"}} onClick={()=>{msg("Interest noted! Unlock contacts to reach the landlord.","info");setSelProp(null);}}>Express Interest →</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── AUTH MODAL ─── */}
      {authModal && (
        <div className="mov" onClick={e=>e.target===e.currentTarget&&setAuthModal(null)}>
          <div className="mdl auth">
            <button className="mclose" style={{position:"static",float:"right",marginBottom:"1rem"}} onClick={()=>setAuthModal(null)}>✕</button>
            <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"1.75rem",fontWeight:700,marginBottom:"0.25rem"}}>{authModal==="admin"?"Admin Login":authModal==="landlord"?"Landlord Portal":"Tenant Portal"}</h2>
            <p style={{color:"#bbb",fontSize:"0.78rem",marginBottom:"1.3rem",lineHeight:1.55}}>{authModal==="admin"?"Restricted — administrators only.":authModal==="landlord"?"Free to join. List properties, upload media, add social links.":"Free to join. Browse all listings. Pay KSh "+settings.unlockFee+" to unlock contacts."}</p>
            {authModal!=="admin" && <div className="auth-tabs">
              <button className={`at${authF.mode==="login"?" on":""}`} onClick={()=>{setAuthF({...authF,mode:"login"});setAuthErr("");}}>Sign In</button>
              <button className={`at${authF.mode==="register"?" on":""}`} onClick={()=>{setAuthF({...authF,mode:"register"});setAuthErr("");}}>Sign Up Free</button>
            </div>}
            {authErr && <div className="aerr">⚠️ {authErr}</div>}
            {authF.mode==="register" && authModal!=="admin" && <div className="fg"><label>Full Name</label><input placeholder="Grace Wanjiku" value={authF.name} onChange={e=>setAuthF({...authF,name:e.target.value})}/></div>}
            <div className="fg"><label>{authModal==="admin"?"Username":"Email"}</label><input type={authModal==="admin"?"text":"email"} placeholder={authModal==="admin"?"admin":"you@example.com"} value={authF.email} onChange={e=>setAuthF({...authF,email:e.target.value})}/></div>
            <div className="fg"><label>Password</label><input type="password" placeholder="••••••••" value={authF.password} onChange={e=>setAuthF({...authF,password:e.target.value})}/></div>
            <button className="bp" style={{width:"100%",padding:"12px"}} onClick={()=>authF.mode==="register"?doRegister(authModal):doLogin(authModal)}>{authF.mode==="register"?"Create Free Account →":"Sign In →"}</button>
            <p style={{fontSize:"0.7rem",color:"#bbb",textAlign:"center",marginTop:"0.9rem"}}>
              {authModal==="admin"?"Demo: username <admin> · password <admin2024>":authModal==="landlord"?"Demo: grace@mail.com / grace123":"Demo: amina@mail.com / amina123"}
            </p>
          </div>
        </div>
      )}

      {/* ─── PAYMENT MODAL ─── */}
      {payModal && (
        <div className="mov" onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
          <div className="mdl pay">
            <button className="mclose" style={{position:"static",float:"right",marginBottom:"0.4rem"}} onClick={()=>setPayModal(null)}>✕</button>
            <div style={{fontSize:"2.4rem",marginBottom:"0.4rem"}}>{payModal.type==="boost"?"⭐":"🔓"}</div>
            <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"1.5rem",fontWeight:700,marginBottom:"0.25rem"}}>{payModal.type==="boost"?"Boost Your Listing":"Unlock This Listing"}</h2>
            <p style={{color:"#bbb",fontSize:"0.78rem",marginBottom:"1.3rem",lineHeight:1.6}}>{payModal.type==="boost"?"Your listing will be pinned at the top of all search results for 30 days.":"Get the exact location and landlord contact details for this listing."}</p>
            <div className="payamt">{payModal.type==="boost"?KES(settings.boostFee):KES(settings.unlockFee)} <small>/ once</small></div>
            <div style={{background:"rgba(0,166,81,0.07)",border:"1px solid rgba(0,166,81,0.2)",borderRadius:9,padding:"1rem",margin:"1.1rem 0"}}>
              <p style={{fontSize:"0.78rem",color:"#555",lineHeight:1.65}}><strong style={{color:"#007A3D"}}>M-PESA</strong><br/>Paybill: <strong>522522</strong> · Account: <strong>HOUSEHUNT</strong><br/>Amount: <strong>{payModal.type==="boost"?KES(settings.boostFee):KES(settings.unlockFee)}</strong></p>
            </div>
            <button className="mpesabtn" onClick={simulatePay}>✓ Confirm M-PESA Payment</button>
            <p className="paynote">Demo simulation. In production, an M-PESA STK push will be sent to your registered phone number.</p>
          </div>
        </div>
      )}

      {/* ─── CONFIRM MODAL ─── */}
      {confModal && (
        <div className="mov" onClick={e=>e.target===e.currentTarget&&setConfModal(null)}>
          <div className="mdl conf">
            <div style={{fontSize:"2.3rem",marginBottom:"0.7rem"}}>{confModal.type==="ban"?"🚫":"🗑️"}</div>
            <h3 style={{fontFamily:"Cormorant Garamond,serif",fontSize:"1.4rem",fontWeight:700,marginBottom:"0.5rem"}}>{confModal.title}</h3>
            <p style={{fontSize:"0.81rem",color:"#777",lineHeight:1.6}}>{confModal.msg2}</p>
            <div className="confbtns">
              <button className="confcancel" onClick={()=>setConfModal(null)}>Cancel</button>
              <button className={confModal.type==="ban"?"confban":"confdel"} onClick={confModal.onConfirm}>{confModal.type==="ban"?"Confirm":"Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.k}`}>{toast.m}</div>}
    </div>
  );
}
