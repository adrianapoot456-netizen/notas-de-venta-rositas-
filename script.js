// script.js (convertido a Supabase, versión lista para pegar tu anon key)
// IMPORT: mantiene formato module (type="module" en script tag)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ------------------ CONFIGURACIÓN SUPABASE ------------------ */
// URL: ya proporcionada por ti
const SUPABASE_URL = "https://yakisvmpdylyzpsroalm.supabase.co";
// Pega aquí tu ANON / Public API Key (NO pegues service_role)
const SUPABASE_ANON_KEY = "sb_publishable_z9fgaO3Zjze9BBrhz7R-wg_MOEtPww8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ------------------ ESTADO GLOBAL ------------------ */
let USER_ID = null;
let productos = [];       // array of {nombre, precio}
let listaProductos = [];  // items added to the note
let notaCounterLocalKeyPrefix = "nota_counter_"; // fallback local counter per user

/* ------------------ Helpers ------------------ */
function safeGet(id) { return document.getElementById(id) || null; }
function escapeId(s) { return s ? s.replace(/[^a-z0-9]/gi, "_") : ""; }
function escapeQuotes(s) { return s ? s.replace(/'/g, "\\'") : ""; }

/* ------------------ DOMContentLoaded ------------------ */
window.addEventListener("DOMContentLoaded", () => {
  // DOM elements (safe)
  const loginScreen = safeGet("loginScreen");
  const appScreen = safeGet("appScreen");

  const emailInput = safeGet("emailInput");
  const passwordInput = safeGet("passwordInput");
  const empresaReg = safeGet("empresaReg");
  const btnLogin = safeGet("btnLogin");
  const btnRegister = safeGet("btnRegister");

  const empresaTitulo = safeGet("empresaTitulo");
  const usuarioEmail = safeGet("usuarioEmail");
  const btnLogout = safeGet("btnLogout");
  const btnEditarEmpresa = safeGet("btnEditarEmpresa");

  const nuevoProducto = safeGet("nuevoProducto");
  const nuevoPrecio = safeGet("nuevoPrecio");
  const btnAgregarCatalogo = safeGet("btnAgregarCatalogo");

  const productoSelect = safeGet("producto");
  const precioInput = safeGet("precio");
  const cantidadInput = safeGet("cantidad");
  const btnAgregarProducto = safeGet("btnAgregarProducto");

  const tbody = safeGet("tbody");
  const totalEl = safeGet("total");

  const firmaCanvas = safeGet("firma");
  const limpiarFirmaBtn = safeGet("limpiarFirma");

  const btnGenerarPDF = safeGet("btnGenerarPDF");
  const btnImprimir = safeGet("btnImprimir");

  const btnAbrirEditor = safeGet("btnAbrirEditor");
  const editorCatalogo = safeGet("editorCatalogo");
  const tbodyCatalogo = safeGet("tbodyCatalogo");
  const btnCerrarEditor = safeGet("btnCerrarEditor");

  const btnExportarCSV = safeGet("btnExportarCSV");

  const clienteInput = safeGet("cliente");
  const fechaInput = safeGet("fecha");
  const empresaInput = safeGet("empresa"); // optional field

  /* ------------------ AUTH: register / login / logout ------------------ */

  // Register
  if (btnRegister) {
    btnRegister.addEventListener("click", async () => {
      try {
        const email = emailInput ? emailInput.value.trim() : "";
        const pass = passwordInput ? passwordInput.value.trim() : "";
        const empresa = empresaReg ? empresaReg.value.trim() : "Mi empresa";
        if (!email || !pass) return alert("Completa correo y contraseña.");

        const { data: signData, error: signError } = await supabase.auth.signUp({
          email, password: pass
        });

        if (signError) throw signError;

        // user may be in signData.user (or signData)
        const userId = signData?.user?.id || null;
        if (userId) {
          // create / upsert row in usuarios table to store empresa and optional counter
          const { error: uErr } = await supabase
            .from("usuarios")
            .upsert([{ id: userId, email, empresa, catalogo: {} }], { onConflict: "id" });
          if (uErr) console.warn("Warning saving usuario row:", uErr);
        }

        alert("Cuenta creada correctamente. Revisa tu correo si Supabase requiere confirmación.");
        if (emailInput) emailInput.value = "";
        if (passwordInput) passwordInput.value = "";
        if (empresaReg) empresaReg.value = "";
      } catch (err) {
        alert(err.message || err);
        console.error("register err", err);
      }
    });
  }

  // Login
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      try {
        const email = emailInput ? emailInput.value.trim() : "";
        const pass = passwordInput ? passwordInput.value.trim() : "";
        if (!email || !pass) return alert("Completa correo y contraseña.");

        const { data, error } = await supabase.auth.signInWithPassword({
          email, password: pass
        });

        if (error) throw error;
        // onAuthStateChange handles UI after login
      } catch (err) {
        alert(err.message || err);
        console.error("login err", err);
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Error cerrando sesión:", e);
      }
    });
  }

  /* ------------------ Auth state listener ------------------ */
  supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (session && session.user) {
        const u = session.user;
        USER_ID = u.id;
        if (loginScreen) loginScreen.style.display = "none";
        if (appScreen) appScreen.style.display = "block";
        if (usuarioEmail) usuarioEmail.textContent = u.email || "";
        await cargarDatosUsuario();
      } else {
        USER_ID = null;
        if (loginScreen) loginScreen.style.display = "flex";
        if (appScreen) appScreen.style.display = "none";
        if (usuarioEmail) usuarioEmail.textContent = "";
        productos = [];
        actualizarSelectSafely(productoSelect, precioInput);
        listaProductos = [];
        actualizarTablaSafely(tbody, totalEl);
        if (empresaTitulo) empresaTitulo.textContent = "Mi empresa";
      }
    } catch (e) {
      console.error("onAuthStateChange error:", e);
    }
  });

  /* ------------------ Cargar datos del usuario (empresa + catálogo) ------------------ */
  async function cargarDatosUsuario() {
    if (!USER_ID) return;
    try {
      // load empresa from usuarios table
      const { data: userRow, error: userErr } = await supabase
        .from("usuarios")
        .select("*")
        .eq("id", USER_ID)
        .single();

      if (userErr && userErr.code !== "PGRST116") { // ignore 'no rows' error code if any
        console.error("Error fetching usuarios row:", userErr);
      } else if (userRow) {
        if (empresaTitulo) empresaTitulo.textContent = userRow.empresa || "Mi empresa";
        if (empresaInput) empresaInput.value = userRow.empresa || "";
      }

      // load catalog from 'catalogo' table (preferred)
      productos = [];
      const { data: catRows, error: catErr } = await supabase
        .from("catalogo")
        .select("*")
        .eq("user_id", USER_ID);

      if (!catErr && Array.isArray(catRows)) {
        productos = catRows.map(r => ({ nombre: r.producto, precio: Number(r.precio) }));
      } else {
        // fallback: try to read catalogo JSON stored in usuarios.catalogo
        const catalogoJson = userRow && userRow.catalogo ? userRow.catalogo : {};
        productos = Object.keys(catalogoJson || {}).map(k => ({ nombre: k, precio: Number(catalogoJson[k]) }));
      }

      actualizarSelectSafely(productoSelect, precioInput);
    } catch (e) {
      console.error("cargarDatosUsuario error:", e);
    }
  }

  /* ------------------ Catálogo: añadir, editar, exportar ------------------ */
  if (btnAgregarCatalogo) {
    btnAgregarCatalogo.addEventListener("click", async () => {
      try {
        if (!USER_ID) return alert("Inicia sesión primero.");
        const nombre = nuevoProducto ? nuevoProducto.value.trim() : "";
        const precio = nuevoPrecio ? parseFloat(nuevoPrecio.value) : NaN;
        if (!nombre || !precio || precio <= 0) return alert("Completa producto y precio válidos.");

        // Insert into catalogo table
        const { error } = await supabase
          .from("catalogo")
          .insert([{ user_id: USER_ID, producto: nombre, precio }]);

        if (error) throw error;

        if (nuevoProducto) nuevoProducto.value = "";
        if (nuevoPrecio) nuevoPrecio.value = "";
        await cargarDatosUsuario();
      } catch (e) {
        console.error("Error agregando catálogo:", e);
        alert(e.message || e);
      }
    });
  }

  function actualizarSelectSafely(selectEl, precioEl) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    productos.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(p=>{
      const opt = document.createElement("option");
      opt.value = p.nombre;
      opt.textContent = `${p.nombre} — $${Number(p.precio).toFixed(2)}`;
      selectEl.appendChild(opt);
    });
    if (selectEl.options.length > 0 && precioEl) {
      precioEl.value = productos.find(x=>x.nombre === selectEl.value)?.precio || "";
    } else if (precioEl) {
      precioEl.value = "";
    }
  }

  function cargarPrecioCatalogo() {
    if (!productoSelect || !precioInput) return;
    const sel = productoSelect.value;
    const p = productos.find(x=>x.nombre === sel);
    precioInput.value = p ? p.precio : "";
  }

  if (btnExportarCSV) {
    btnExportarCSV.addEventListener("click", () => {
      if (productos.length === 0) return alert("Catálogo vacío.");
      const filas = productos.map(p => `${p.nombre},${p.precio}`);
      const blob = new Blob([filas.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "catalogo.csv"; a.click();
    });
  }

  /* ------------------ Editor de catálogo (popup) ------------------ */
  if (btnAbrirEditor) {
    btnAbrirEditor.addEventListener("click", ()=> {
      if (!USER_ID) return alert("Inicia sesión.");
      cargarEditorCatalogo();
      if (editorCatalogo) editorCatalogo.style.display = "flex";
    });
  }
  if (btnCerrarEditor) btnCerrarEditor.addEventListener("click", ()=> { if (editorCatalogo) editorCatalogo.style.display = "none"; });

  async function cargarEditorCatalogo() {
    if (!tbodyCatalogo) return;
    tbodyCatalogo.innerHTML = "";
    productos.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(p=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${p.nombre}" id="n_${escapeId(p.nombre)}" /></td>
        <td><input type="number" step="0.01" value="${p.precio}" id="p_${escapeId(p.nombre)}" /></td>
        <td>
          <button class="btn btn-primary" onclick="guardarCambiosProducto('${escapeQuotes(p.nombre)}')">Guardar</button>
          <button class="btn btn-danger" onclick="eliminarProducto('${escapeQuotes(p.nombre)}')">Eliminar</button>
        </td>
      `;
      tbodyCatalogo.appendChild(tr);
    });
  }

  window.guardarCambiosProducto = async function(nombreOriginal) {
    try {
      if (!USER_ID) return alert("Inicia sesión.");
      const inputName = document.getElementById("n_" + escapeId(nombreOriginal));
      const inputPrice = document.getElementById("p_" + escapeId(nombreOriginal));
      if (!inputName || !inputPrice) return alert("Elemento no encontrado.");

      const nuevoNombre = inputName.value.trim();
      const nuevoPrecio = parseFloat(inputPrice.value);
      if (!nuevoNombre || !nuevoPrecio) return alert("Datos inválidos.");

      // update by matching product name & user_id
      const { error } = await supabase
        .from("catalogo")
        .update({ producto: nuevoNombre, precio: nuevoPrecio })
        .match({ user_id: USER_ID, producto: nombreOriginal });

      if (error) throw error;

      // if product name changed, ensure other rows updated (match above handles it)
      await cargarDatosUsuario();
      cargarEditorCatalogo();
    } catch (e) {
      console.error("guardarCambiosProducto error:", e);
      alert(e.message || e);
    }
  };

  window.eliminarProducto = async function(nombre) {
    try {
      if (!confirm("Eliminar producto?")) return;
      if (!USER_ID) return alert("Inicia sesión.");
      const { error } = await supabase
        .from("catalogo")
        .delete()
        .match({ user_id: USER_ID, producto: nombre });
      if (error) throw error;
      await cargarDatosUsuario();
      cargarEditorCatalogo();
    } catch (e) {
      console.error("eliminarProducto error:", e);
      alert(e.message || e);
    }
  };

  /* ------------------ Agregar items a la nota ------------------ */
  if (btnAgregarProducto) {
    btnAgregarProducto.addEventListener("click", () => {
      const nombre = productoSelect ? productoSelect.value : "";
      const precio = precioInput ? parseFloat(precioInput.value) : NaN;
      const cantidad = cantidadInput ? parseInt(cantidadInput.value) : NaN;
      if (!nombre || !precio || !cantidad || cantidad <= 0) return alert("Completa los datos.");
      const subtotal = Number((precio * cantidad).toFixed(2));
      listaProductos.push({ producto: nombre, precio, cantidad, subtotal });
      actualizarTablaSafely(tbody, totalEl);
    });
  }

  function actualizarTablaSafely(tbodyEl, totalElRef) {
    if (!tbodyEl || !totalElRef) return;
    tbodyEl.innerHTML = "";
    let total = 0;
    listaProductos.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.producto}</td>
        <td>$${Number(item.precio).toFixed(2)}</td>
        <td>${item.cantidad}</td>
        <td>$${Number(item.subtotal).toFixed(2)}</td>
      `;
      tbodyEl.appendChild(tr);
      total += item.subtotal;
    });
    totalElRef.textContent = `Total: $${total.toFixed(2)}`;
  }

  /* ------------------ Firma en canvas ------------------ */
  if (firmaCanvas) {
    const ctx = firmaCanvas.getContext("2d");
    let drawing = false;
    firmaCanvas.addEventListener("mousedown", ()=> drawing = true);
    firmaCanvas.addEventListener("mouseup", ()=> drawing = false);
    firmaCanvas.addEventListener("mouseleave", ()=> drawing = false);
    firmaCanvas.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      const rect = firmaCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.fillStyle = "#c95f88";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI*2);
      ctx.fill();
    });
    if (limpiarFirmaBtn) limpiarFirmaBtn.addEventListener("click", ()=> ctx.clearRect(0,0,firmaCanvas.width,firmaCanvas.height));
  }

  /* ------------------ Numero de nota (por usuario) ------------------ */
  async function obtenerNumeroNota() {
    try {
      // read counter from usuarios table
      const { data, error } = await supabase
        .from("usuarios")
        .select("_notaCounter")
        .eq("id", USER_ID)
        .single();

      let counter = 1;
      if (!error && data && data._notaCounter) {
        counter = Number(data._notaCounter) + 1;
      }

      // update
      const { error: upErr } = await supabase
        .from("usuarios")
        .update({ _notaCounter: counter })
        .eq("id", USER_ID);

      if (upErr) console.warn("No se pudo actualizar contador (fallback local):", upErr);

      return String(counter).padStart(4, "0");
    } catch (e) {
      // fallback localStorage
      const key = notaCounterLocalKeyPrefix + (USER_ID || "guest");
      let n = localStorage.getItem(key);
      n = n ? parseInt(n) + 1 : 1;
      localStorage.setItem(key, n);
      return String(n).padStart(4,"0");
    }
  }

  /* ------------------ Generar PDF y guardar nota en Supabase ------------------ */
  if (btnGenerarPDF) {
    btnGenerarPDF.addEventListener("click", async () => {
      try {
        if (!USER_ID) return alert("Inicia sesión para generar notas.");
        if (listaProductos.length === 0) return alert("Agrega al menos un producto.");

        const numero = await obtenerNumeroNota();
        const cliente = clienteInput ? (clienteInput.value.trim() || "") : "";
        const fecha = fechaInput ? (fechaInput.value || new Date().toLocaleDateString()) : new Date().toLocaleDateString();
        const empresa = (empresaInput && empresaInput.value.trim()) || (empresaTitulo && empresaTitulo.textContent) || "Mi empresa";
        const total = listaProductos.reduce((a,b)=>a + b.subtotal, 0);

        // preparar pdf
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF("p","pt","letter");
        doc.setFillColor(253,231,240);
        doc.rect(0,0,612,792,"F");

        doc.setFontSize(20);
        doc.setTextColor("#c2527d");
        doc.text(empresa, 306, 60, { align: "center" });

        doc.setFontSize(16);
        doc.setTextColor("#444");
        doc.text("Nota de Venta", 306, 85, { align: "center" });

        doc.setFontSize(12);
        doc.text(`No. Nota: ${numero}`, 40, 120);
        doc.text(`Cliente: ${cliente}`, 40, 140);
        doc.text(`Fecha: ${fecha}`, 40, 160);

        const filas = listaProductos.map(i => [ i.producto, "$"+i.precio.toFixed(2), i.cantidad, "$"+i.subtotal.toFixed(2) ]);

        doc.autoTable({
          startY: 190,
          head: [["Producto","Precio","Cantidad","Subtotal"]],
          body: filas,
          headStyles: { fillColor: [248,182,202], textColor: "#fff" },
          bodyStyles: { fillColor: [252,224,235] }
        });

        doc.setFontSize(14);
        doc.setTextColor("#c2527d");
        doc.text(`Total: $${total.toFixed(2)}`, 450, doc.lastAutoTable.finalY + 30);

        // firma
        let firmaImg = null;
        if (firmaCanvas) {
          firmaImg = firmaCanvas.toDataURL("image/png");
          doc.addImage(firmaImg, "PNG", 40, doc.lastAutoTable.finalY + 60, 200, 100);
        }

        // guardar nota en Supabase (tabla notas)
        const { error: insertErr } = await supabase
          .from("notas")
          .insert([{
            user_id: USER_ID,
            numero_nota: numero,
            cliente,
            fecha,
            empresa,
            total,
            productos: listaProductos,
            firma: firmaImg
          }]);

        if (insertErr) console.error("Error guardando nota:", insertErr);

        doc.save(`Nota_${numero}.pdf`);

        // limpiar lista para nueva nota
        listaProductos = [];
        actualizarTablaSafely(tbody, totalEl);
        alert("Nota generada y guardada.");
      } catch (e) {
        console.error("Generar PDF error:", e);
        alert(e.message || e);
      }
    });
  }

  /* ------------------ Editar nombre de empresa ------------------ */
  if (btnEditarEmpresa) {
    btnEditarEmpresa.addEventListener("click", async () => {
      try {
        const current = (empresaInput && empresaInput.value) || (empresaTitulo && empresaTitulo.textContent) || "";
        const nuevo = prompt("Nombre de la empresa:", current);
        if (nuevo === null) return;
        if (empresaInput) empresaInput.value = nuevo;
        if (empresaTitulo) empresaTitulo.textContent = nuevo;
        if (USER_ID) {
          const { error } = await supabase
            .from("usuarios")
            .update({ empresa: nuevo })
            .eq("id", USER_ID);
          if (error) throw error;
          alert("Nombre de empresa guardado.");
        }
      } catch (e) {
        console.error("Editar empresa error:", e);
        alert(e.message || e);
      }
    });
  }

  /* ------------------ Bindings adicionales ------------------ */
  if (productoSelect) productoSelect.addEventListener("change", cargarPrecioCatalogo);
  if (btnImprimir) btnImprimir.addEventListener("click", () => window.print());

  // Inicializar UI bindings (por si el usuario ya estaba logueado)
  // Si ya hay sesión activa, onAuthStateChange la manejará.
}); // end DOMContentLoaded
