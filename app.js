// =====================================================
// ⚙️ CẤU HÌNH - THAY 2 GIÁ TRỊ NÀY BẰNG THÔNG TIN SUPABASE
// =====================================================
const SUPABASE_URL = "https://mnnesflxvxjxnxqygnqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ubmVzZmx4dnhqeG54cXlnbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzQ5OTMsImV4cCI6MjEwNzY1MDk5M30.7DX_NXSICr3S_V-1R7aKqVudVAR-aWAijQeWJQMBAjQ";

// ===== KHỞI TẠO =====
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let config = null;
let currentPosition = null;

// =====================================================
// 🔧 HÀM TIỆN ÍCH
// =====================================================

// Tính khoảng cách (mét) giữa 2 tọa độ - công thức Haversine
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Lấy/tạo Device ID duy nhất cho thiết bị
function getDeviceId() {
  let id = localStorage.getItem('dd_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('dd_device_id', id);
  }
  return id;
}

// Kiểm tra giờ hiện tại có trong khung điểm danh
function isWithinCheckinTime() {
  if (!config) return false;
  const now = new Date();
  const [sh, sm] = config.checkin_start.split(':').map(Number);
  const [eh, em] = config.checkin_end.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= (sh*60 + sm) && nowMin <= (eh*60 + em);
}

// Lấy vị trí GPS
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Trình duyệt không hỗ trợ GPS'));
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => {
        const msgs = {
          1: 'Bạn chưa cho phép truy cập vị trí. Vào cài đặt trình duyệt để bật.',
          2: 'Không xác định được vị trí. Kiểm tra GPS.',
          3: 'Hết thời gian lấy vị trí. Thử lại.'
        };
        reject(new Error(msgs[err.code] || 'Lỗi GPS'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Hiển thị thông báo
function showMsg(text, ok = false) {
  const msg = document.getElementById('auth-msg');
  msg.textContent = text;
  msg.className = 'msg' + (ok ? ' success' : '');
}

// Định dạng ngày giờ
function formatDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

// =====================================================
// 🔐 XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ
// =====================================================

// Chuyển tab
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isRegister = tab.dataset.tab === 'register';
    document.getElementById('register-fields').style.display = isRegister ? 'block' : 'none';
    document.getElementById('btn-submit').textContent = isRegister ? 'Đăng ký' : 'Đăng nhập';
    showMsg('');
  });
});

// Nút submit (đăng nhập hoặc đăng ký)
document.getElementById('btn-submit').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const fullName = document.getElementById('full_name').value.trim();
  const studentId = document.getElementById('student_id').value.trim();
  const isRegister = document.querySelector('.tab.active').dataset.tab === 'register';
  const btn = document.getElementById('btn-submit');

  // Validate
  if (!email || !password) return showMsg('Nhập đầy đủ email và mật khẩu');
  if (password.length < 6) return showMsg('Mật khẩu phải từ 6 ký tự');
  if (isRegister && (!fullName || !studentId)) return showMsg('Nhập đầy đủ họ tên và MSSV');

  btn.disabled = true;
  btn.textContent = isRegister ? 'Đang đăng ký...' : 'Đang đăng nhập...';

  try {
    if (isRegister) {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Không tạo được tài khoản');

      // Lưu profile
      const { error: pErr } = await db.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        student_id: studentId,
        device_id: getDeviceId()
      });
      if (pErr) {
        if (pErr.code === '23505') throw new Error('MSSV đã tồn tại');
        throw pErr;
      }
      showMsg('Đăng ký thành công!', true);
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    await initAfterLogin();
  } catch (err) {
    let m = err.message;
    if (m.includes('Invalid login credentials')) m = 'Sai email hoặc mật khẩu';
    if (m.includes('User already registered')) m = 'Email đã được đăng ký';
    showMsg(m);
  } finally {
    btn.disabled = false;
    btn.textContent = isRegister ? 'Đăng ký' : 'Đăng nhập';
  }
});

// =====================================================
// ✅ SAU KHI ĐĂNG NHẬP
// =====================================================
async function initAfterLogin() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  currentUser = user;

  // Lấy profile
  const { data: profile, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    await db.auth.signOut();
    return showMsg('Không tìm thấy hồ sơ. Liên hệ giáo viên.');
  }
  currentProfile = profile;

  // Kiểm tra thiết bị
  const thisDevice = getDeviceId();
  if (profile.device_id && profile.device_id !== thisDevice) {
    await db.auth.signOut();
    return showMsg('⚠️ Tài khoản đã đăng nhập trên thiết bị khác.');
  }
  if (!profile.device_id) {
    await db.from('profiles').update({ device_id: thisDevice }).eq('id', user.id);
  }

  // Lấy config
  const { data: cfg } = await db
    .from('class_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (!cfg) {
    await db.auth.signOut();
    return showMsg('Chưa có cấu hình lớp học. Liên hệ admin.');
  }
  config = cfg;

  // Đổi màn hình
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  document.getElementById('user-name').textContent = profile.full_name;
  document.getElementById('school-name').textContent = cfg.school_name;
  document.getElementById('time-range').textContent = `${cfg.checkin_start.slice(0,5)} - ${cfg.checkin_end.slice(0,5)}`;
  document.getElementById('radius').textContent = `${cfg.radius_meters}m`;

  await loadHistory();
  await checkLocation();
}

// =====================================================
// 🚪 ĐĂNG XUẤT
// =====================================================
document.getElementById('btn-logout').addEventListener('click', async () => {
  if (!confirm('Bạn có chắc muốn đăng xuất?')) return;
  await db.auth.signOut();
  location.reload();
});

// =====================================================
// 📍 KIỂM TRA VỊ TRÍ
// =====================================================
async function checkLocation() {
  const statusBox = document.getElementById('status-box');
  const btn = document.getElementById('btn-checkin');
  const distEl = document.getElementById('distance');

  statusBox.className = 'status-box loading';
  statusBox.textContent = '🛰️ Đang lấy vị trí GPS...';
  btn.disabled = true;

  try {
    const coords = await getPosition();
    currentPosition = coords;

    const dist = haversine(
      coords.latitude, coords.longitude,
      config.school_lat, config.school_lng
    );
    distEl.textContent = `${Math.round(dist)}m`;

    // Check bán kính
    if (dist > config.radius_meters) {
      statusBox.className = 'status-box error';
      statusBox.textContent = `❌ Bạn đang cách trường ${Math.round(dist)}m.\nCần ở trong bán kính ${config.radius_meters}m.`;
      return;
    }

    // Check giờ
    if (!isWithinCheckinTime()) {
      statusBox.className = 'status-box error';
      statusBox.textContent = `⏰ Ngoài giờ điểm danh.\nKhung giờ: ${config.checkin_start.slice(0,5)} - ${config.checkin_end.slice(0,5)}`;
      return;
    }

    // Check mở điểm danh
    if (!config.checkin_open) {
      statusBox.className = 'status-box error';
      statusBox.textContent = '🔒 Giáo viên chưa mở điểm danh.';
      return;
    }

    // Check đã điểm danh hôm nay
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: existing } = await db
      .from('attendance')
      .select('id, checkin_at')
      .eq('user_id', currentUser.id)
      .gte('checkin_at', startOfDay)
      .lt('checkin_at', endOfDay);

    if (existing && existing.length > 0) {
      statusBox.className = 'status-box ok';
      statusBox.textContent = '✅ Bạn đã điểm danh hôm nay rồi.';
      return;
    }

    // Hợp lệ
    statusBox.className = 'status-box ok';
    statusBox.textContent = `✅ Vị trí hợp lệ (cách trường ${Math.round(dist)}m).\nSẵn sàng điểm danh!`;
    btn.disabled = false;

  } catch (err) {
    statusBox.className = 'status-box error';
    statusBox.textContent = '❌ ' + err.message;
  }
}

// =====================================================
// 🎯 NÚT ĐIỂM DANH
// =====================================================
document.getElementById('btn-checkin').addEventListener('click', async () => {
  const btn = document.getElementById('btn-checkin');
  const statusBox = document.getElementById('status-box');
  btn.disabled = true;
  statusBox.className = 'status-box loading';
  statusBox.textContent = '⏳ Đang gửi điểm danh...';

  try {
    const dist = haversine(
      currentPosition.latitude, currentPosition.longitude,
      config.school_lat, config.school_lng
    );

    const { error } = await db.from('attendance').insert({
      user_id: currentUser.id,
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      distance_meters: Math.round(dist),
      status: 'present'
    });
    if (error) throw error;

    statusBox.className = 'status-box ok';
    statusBox.textContent = '🎉 Điểm danh thành công!';
    await loadHistory();
  } catch (err) {
    statusBox.className = 'status-box error';
    statusBox.textContent = '❌ Lỗi: ' + err.message;
    btn.disabled = false;
  }
});

// =====================================================
// 📋 LỊCH SỬ ĐIỂM DANH
// =====================================================
async function loadHistory() {
  const box = document.getElementById('history');
  const { data, error } = await db
    .from('attendance')
    .select('checkin_at, distance_meters, status')
    .eq('user_id', currentUser.id)
    .order('checkin_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    box.innerHTML = '<p class="empty">Chưa có lịch sử điểm danh</p>';
    return;
  }

  box.innerHTML = data.map(item => {
    const { date, time } = formatDateTime(item.checkin_at);
    return `
      <div class="history-item">
        <div>
          <div class="date">${date}</div>
          <div class="time">${time} • ${Math.round(item.distance_meters)}m</div>
        </div>
        <div class="ok">✓ Có mặt</div>
      </div>
    `;
  }).join('');
}

// =====================================================
// 🚀 KHỞI ĐỘNG: kiểm tra đã đăng nhập chưa
// =====================================================
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await initAfterLogin();
  }
})();
