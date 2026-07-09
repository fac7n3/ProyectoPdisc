import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { isValidPhone } from './validation-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const registerView = document.getElementById('register-view');
const statusView = document.getElementById('status-view');
const statusIcon = document.getElementById('status-icon');
const statusTitle = document.getElementById('status-title');
const statusText = document.getElementById('status-text');

function showStatus({ icon, title, text }) {
  registerView.style.display = 'none';
  statusView.style.display = 'block';
  statusIcon.className = icon;
  statusTitle.textContent = title;
  statusText.textContent = text;
}

/** Repartidor ya aprobado, solicitud pendiente, o nada todavía (mostrar form) */
async function checkDeliveryState(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'repartidor') {
    showStatus({
      icon: 'fa-solid fa-circle-check',
      title: '¡Ya sos repartidor!',
      text: 'El panel de pedidos disponibles está en construcción — pronto vas a poder tomar entregas desde acá.',
    });
    return;
  }

  const { data: req } = await supabase
    .from('delivery_requests')
    .select('status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (req?.status === 'pending') {
    showStatus({
      icon: 'fa-regular fa-clock',
      title: 'Solicitud en revisión',
      text: 'Te avisamos apenas el equipo la revise.',
    });
    return;
  }

  if (req?.status === 'rejected') {
    showStatus({
      icon: 'fa-solid fa-circle-xmark',
      title: 'Solicitud rechazada',
      text: 'Podés escribirnos si creés que fue un error, o volver a intentarlo más adelante.',
    });
    return;
  }

  // Sin solicitud todavía: mostrar el formulario
  registerView.style.display = 'block';
  statusView.style.display = 'none';
}

function initRepartidorPage(user) {
  checkDeliveryState(user);

  const form = document.getElementById('delivery-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const vehicleTypeSelect = document.getElementById('delivery-vehicle-type');
  const plateGroup = document.getElementById('delivery-plate-group');
  const plateInput = document.getElementById('delivery-plate');

  function updatePlateVisibility() {
    const needsPlate = vehicleTypeSelect.value !== 'bicicleta';
    plateGroup.style.display = needsPlate ? 'block' : 'none';
  }
  vehicleTypeSelect?.addEventListener('change', updatePlateVisibility);
  updatePlateVisibility();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('delivery-name').value.trim();
    const phone = document.getElementById('delivery-phone').value.trim();
    const vehicleType = vehicleTypeSelect.value;
    const vehiclePlate = plateInput.value.trim();

    if (fullName.length < 3) {
      showToast('Ingresá tu nombre completo.', 'error');
      return;
    }
    if (!isValidPhone(phone)) {
      showToast('El teléfono ingresado no es válido.', 'error');
      return;
    }
    if (vehicleType !== 'bicicleta' && !vehiclePlate) {
      showToast('Ingresá la patente del vehículo.', 'error');
      return;
    }

    setLoading(submitBtn, true, 'Enviar solicitud');

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      showToast('Sesión inválida.', 'error');
      setLoading(submitBtn, false, 'Enviar solicitud');
      return;
    }

    const { error } = await supabase.from('delivery_requests').insert({
      user_id: currentUser.id,
      full_name: fullName,
      phone,
      vehicle_type: vehicleType,
      vehicle_plate: vehicleType === 'bicicleta' ? null : vehiclePlate,
    });

    if (error) {
      console.error('Error al enviar solicitud de repartidor:', error);
      showToast('Hubo un error al procesar tu solicitud.', 'error');
      setLoading(submitBtn, false, 'Enviar solicitud');
      return;
    }

    showToast('¡Solicitud enviada! Te avisamos cuando la revisemos.', 'success');
    showStatus({
      icon: 'fa-regular fa-clock',
      title: 'Solicitud en revisión',
      text: 'Te avisamos apenas el equipo la revise.',
    });
  });

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    window.location.href = './home.html';
  });
}

// Página PRIVADA: si no hay sesión → redirigir a Login
guardPage({
  requireAuth: true,
  onReady: (user) => {
    initRepartidorPage(user);
  },
});
