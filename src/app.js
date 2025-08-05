document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('planoCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const planoImagen = document.getElementById('planoImagen');
    const modalTipoPuesto = document.getElementById('modalTipoPuesto');

    const TIPOS_PUESTO = {
        GERENCIAL: 'GERENCIAL',
        PIZZAS: 'PIZZAS',
        ESTANDAR: 'ESTANDAR'
    };

    const state = {
        empresas: [],
        puestos: [],
        activeEmpresaId: null,
        isPainting: false,
        pendingPuesto: null,
        modoBorrado: false, 
    };

    function initializeApp() {
        planoImagen.onload = () => {
            canvas.width = planoImagen.naturalWidth;
            canvas.height = planoImagen.naturalHeight;
            ctx.drawImage(planoImagen, 0, 0);
            cargarDatos();
        };
        if (planoImagen.complete) {
            planoImagen.onload();
        }
        setupEventListeners();
    }

    function setupEventListeners() {
        canvas.addEventListener('click', handleCanvasClick);
        document.getElementById('empresaForm').addEventListener('submit', agregarEmpresa);
        document.getElementById('limpiarTodo').addEventListener('click', limpiarTodo);
        document.getElementById('exportPDF').addEventListener('click', generarPDF);
        
        document.getElementById('closeTipoPuesto').addEventListener('click', () => modalTipoPuesto.style.display = 'none');
        document.getElementById('btnConfirmarTipo').addEventListener('click', confirmarTipoPuesto);

        // Evento del nuevo botón
        document.getElementById('btnToggleBorrado').addEventListener('click', toggleModoBorrado);
    }

    function toggleModoBorrado() {
        state.modoBorrado = !state.modoBorrado;
        const btn = document.getElementById('btnToggleBorrado');
        if (state.modoBorrado) {
            btn.textContent = 'Desactivar Modo Borrado';
            btn.classList.add('btn-danger');
            canvas.style.cursor = 'cell'; // O un cursor de borrador
        } else {
            btn.textContent = 'Activar Modo Borrado';
            btn.classList.remove('btn-danger');
            canvas.style.cursor = 'default';
        }
    }

    function handleCanvasClick(event) {
        if (state.isPainting) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.round((event.clientX - rect.left) * (canvas.width / rect.width));
        const y = Math.round((event.clientY - rect.top) * (canvas.height / rect.height));

        // Lógica para el MODO BORRADO
        if (state.modoBorrado) {
            const puestoAEliminar = state.puestos.find(p => Math.abs(p.x - x) < 15 && Math.abs(p.y - y) < 15);
            
            if (puestoAEliminar) {
                if (confirm(`¿Seguro que quieres eliminar este puesto de tipo ${puestoAEliminar.tipo}?`)) {
                    state.puestos = state.puestos.filter(p => p.id !== puestoAEliminar.id);
                    floodFill(puestoAEliminar.x, puestoAEliminar.y, [255, 255, 255], () => {
                        actualizarUI();
                        guardarDatos();
                    });
                }
            } else {
                alert("No se encontró ningún puesto en esta ubicación para borrar.");
            }
            return; // Termina la función aquí si está en modo borrado
        }

        // Lógica de PINTADO (sin cambios)
        if (!state.activeEmpresaId) {
            return alert('Por favor, selecciona una empresa de la lista antes de pintar.');
        }

        const activeEmpresa = state.empresas.find(e => e.id === state.activeEmpresaId);
        if (!activeEmpresa) return;

        const fillColor = hexToRgba(activeEmpresa.color);
        const targetColor = getPixelColor(ctx.getImageData(0, 0, canvas.width, canvas.height), x, y);

        if (colorsAreSimilar(targetColor, fillColor, 10)) return; // Si ya está pintado del mismo color, no hacer nada
        
        state.pendingPuesto = { x, y, empresaId: activeEmpresa.id, fillColor };
        modalTipoPuesto.style.display = 'block';
    }

    function confirmarTipoPuesto() {
        if (!state.pendingPuesto) return;

        const tipoSeleccionado = document.getElementById('selectTipoPuesto').value;
        const { x, y, empresaId, fillColor } = state.pendingPuesto;

        const nuevoPuesto = {
            id: Date.now(),
            tipo: tipoSeleccionado,
            x: x,
            y: y,
            empresaId: empresaId,
            ocupado: true
        };
        
        state.puestos.push(nuevoPuesto);
        floodFill(x, y, fillColor, () => {
            actualizarUI();
            guardarDatos();
        });

        modalTipoPuesto.style.display = 'none';
        state.pendingPuesto = null;
    }

    function agregarEmpresa(e) {
        e.preventDefault();
        const nombreInput = document.getElementById('nombreEmpresa');
        const colorInput = document.getElementById('colorEmpresa');
        const nombre = nombreInput.value.trim();
        const color = colorInput.value;

        if (!nombre) return alert('El nombre es obligatorio.');

        if (state.empresas.some(emp => emp.nombre.toLowerCase() === nombre.toLowerCase())) {
            return alert('Ya existe una empresa con ese nombre.');
        }
        if (state.empresas.some(emp => emp.color === color)) {
            return alert('Ese color ya ha sido elegido por otra empresa.');
        }

        const empresa = { id: Date.now().toString(), nombre, color };
        state.empresas.push(empresa);
        actualizarUI();
        guardarDatos();
        nombreInput.value = '';
    }

    function seleccionarEmpresa(id) {
        state.activeEmpresaId = id;
        actualizarListaEmpresas();
    }

    function eliminarEmpresa(id, event) {
        event.stopPropagation();
        if (!confirm('¿Seguro que quieres eliminar esta empresa? Los puestos y colores asignados se borrarán.')) return;

        const puestosAEliminar = state.puestos.filter(p => p.empresaId === id);
        puestosAEliminar.forEach(puesto => {
            floodFill(puesto.x, puesto.y, [255, 255, 255]);
        });
        
        state.puestos = state.puestos.filter(p => p.empresaId !== id);
        state.empresas = state.empresas.filter(e => e.id !== id);
        if (state.activeEmpresaId === id) state.activeEmpresaId = null;

        actualizarUI();
        guardarDatos();
    }

    function floodFill(startX, startY, fillColor, callback) {
        state.isPainting = true;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const targetColor = getPixelColor(imageData, startX, startY);
        const tolerance = 30;

        if (colorsAreSimilar(targetColor, fillColor, 10)) {
            state.isPainting = false;
            if (callback) callback();
            return;
        }

        const queue = [[startX, startY]];
        const visited = new Uint8Array(imageData.width * imageData.height);
        visited[startY * canvas.width + startX] = 1;

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            setPixelColor(imageData, x, y, fillColor);
            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (const [nx, ny] of neighbors) {
                const index1D = ny * canvas.width + nx;
                if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height && !visited[index1D]) {
                    if (colorsAreSimilar(getPixelColor(imageData, nx, ny), targetColor, tolerance)) {
                        visited[index1D] = 1;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
        state.isPainting = false;
        if (callback) callback();
    }

    function hexToRgba(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return [r, g, b]; }
    function colorsAreSimilar(c1, c2, tol) { const dr = c1[0] - c2[0], dg = c1[1] - c2[1], db = c1[2] - c2[2]; return (dr * dr + dg * dg + db * db) < (tol * tol); }
    function getPixelColor(d, x, y) { const i = (y * d.width + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2]]; }
    function setPixelColor(d, x, y, c) { const i = (y * d.width + x) * 4; d.data[i] = c[0]; d.data[i + 1] = c[1]; d.data[i + 2] = c[2]; d.data[i + 3] = 255; }

    function actualizarUI() {
        actualizarListaEmpresas();
        actualizarTablaResumen();
        actualizarTablaGeneral();
    }

    function actualizarListaEmpresas() {
        const lista = document.getElementById('listaEmpresas');
        lista.innerHTML = '';
        state.empresas.forEach(empresa => {
            const div = document.createElement('div');
            div.className = `empresa-item ${state.activeEmpresaId === empresa.id ? 'active' : ''}`;
            div.onclick = () => seleccionarEmpresa(empresa.id);
            div.innerHTML = `
                <div class="empresa-info">
                    <div class="empresa-color" style="background-color: ${empresa.color}"></div>
                    <span class="empresa-nombre">${empresa.nombre}</span>
                </div>
                <button class="btn-small btn-delete" onclick="eliminarEmpresa('${empresa.id}', event)">&times;</button>`;
            lista.appendChild(div);
        });
    }

    function actualizarTablaResumen() {
        const tbody = document.querySelector('#tablaEmpresas tbody');
        tbody.innerHTML = '';
        state.empresas.forEach(empresa => {
            const puestosAsignados = state.puestos.filter(p => p.empresaId === empresa.id);
            const gerencial = puestosAsignados.filter(p => p.tipo === TIPOS_PUESTO.GERENCIAL).length;
            const pizzas = puestosAsignados.filter(p => p.tipo === TIPOS_PUESTO.PIZZAS).length;
            const estandar = puestosAsignados.filter(p => p.tipo === TIPOS_PUESTO.ESTANDAR).length;
            const row = tbody.insertRow();
            row.innerHTML = `
                <td style="background-color: ${empresa.color}20; font-weight: bold;">${empresa.nombre}</td>
                <td>${gerencial}</td>
                <td>${pizzas}</td>
                <td>${estandar}</td>
                <td style="font-weight: bold;">${puestosAsignados.length}</td>`;
        });
    }

    function actualizarTablaGeneral() {
        const totalPuestos = state.puestos.length;
        let ocupados = { G: 0, P: 0, E: 0 };
        state.puestos.forEach(p => {
            if (p.ocupado) {
                if (p.tipo === TIPOS_PUESTO.GERENCIAL) ocupados.G++;
                if (p.tipo === TIPOS_PUESTO.PIZZAS) ocupados.P++;
                if (p.tipo === TIPOS_PUESTO.ESTANDAR) ocupados.E++;
            }
        });

        document.getElementById('ocupadosGerencial').textContent = ocupados.G;
        document.getElementById('ocupadosPizzas').textContent = ocupados.P;
        document.getElementById('ocupadosEstandar').textContent = ocupados.E;
        document.getElementById('ocupadosTotal').textContent = totalPuestos;
        document.getElementById('disponiblesGerencial').textContent = 0;
        document.getElementById('disponiblesPizzas').textContent = 0;
        document.getElementById('disponiblesEstandar').textContent = 0;
        document.getElementById('disponiblesTotal').textContent = 0;
        document.getElementById('totalGerencial').textContent = ocupados.G;
        document.getElementById('totalPizzas').textContent = ocupados.P;
        document.getElementById('totalEstandar').textContent = ocupados.E;
        document.getElementById('totalGeneral').textContent = totalPuestos;
    }

    function guardarDatos() {
        const data = { empresas: state.empresas, puestos: state.puestos, canvas: canvas.toDataURL() };
        localStorage.setItem('hubuxState', JSON.stringify(data));
    }

    function cargarDatos() {
        const dataJSON = localStorage.getItem('hubuxState');
        if (!dataJSON) {
            actualizarUI();
            return;
        }
        const data = JSON.parse(dataJSON);
        state.empresas = data.empresas || [];
        state.puestos = data.puestos || [];

        if (data.canvas) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                actualizarUI();
            };
            img.src = data.canvas;
        } else {
            actualizarUI();
        }
    }

    function limpiarTodo() {
        if (confirm('¿Seguro? Esto borrará todas las empresas, puestos y colores.')) {
            localStorage.removeItem('hubuxState');
            state.activeEmpresaId = null;
            state.empresas = [];
            state.puestos = [];
            ctx.drawImage(planoImagen, 0, 0);
            actualizarUI();
        }
    }

    function generarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFontSize(20);
        doc.text('Resumen de Ocupación Hubux', pageWidth / 2, 15, { align: 'center' });
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 15, 25, 180, 135);
        
        doc.autoTable({ html: '#tablaEmpresas', startY: 25, margin: { left: 200 }, theme: 'grid', headStyles: { fillColor: [41, 128, 185] }});
        doc.autoTable({ html: '.resumen-general-table table', startY: doc.lastAutoTable.finalY + 10, margin: { left: 200 }, theme: 'grid', headStyles: { fillColor: [243, 156, 18] } });
        
        doc.save(`Resumen_Hubux_${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    initializeApp();
});