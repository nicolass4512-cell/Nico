# Presupuesto 2027

Aplicación web para **programar, controlar y visualizar** el presupuesto mensual de todo el año 2027,
con **KPI de gestión** y **recomendaciones de optimización**.

No requiere instalación ni servidor: abre `index.html` en cualquier navegador moderno.
Los datos se guardan automáticamente en el navegador (localStorage); usa *Configuración → Exportar respaldo*
para tener una copia en archivo JSON.

## Secciones

| Pestaña | Qué hace |
|---|---|
| **Resumen** | Totales anuales plan vs. real, gráfico de gastos mensuales, ahorro acumulado y la vista anual con los 12 meses (plan, real, diferencia y semáforo de cada mes). |
| **Meses** | Una tarjeta por cada mes de 2027 con barras de avance de ingresos, gastos y ahorro. Al hacer clic se abre el detalle por categoría y se pueden registrar movimientos de ese mes. |
| **Planificación** | Cuadrícula categoría × mes para programar el presupuesto. Herramientas: copiar enero a todo el año, repetir una fila, aplicar incremento % desde un mes y ajustar los meses futuros al promedio real. |
| **Movimientos** | Registro de ingresos, gastos y aportes de ahorro reales, con filtros por mes y categoría y exportación a CSV. |
| **KPI y optimización** | 12 indicadores con meta y semáforo, recomendaciones automáticas, distribución 50/30/20, control por categoría y tablero mensual de KPI. Se puede analizar el acumulado del año o un mes específico. |
| **Configuración** | Moneda, meta de ahorro, tolerancia de desviación, saldo inicial del fondo de emergencia, gestión de categorías e importación/exportación de datos. |

## KPI incluidos

| KPI | Fórmula | Meta por defecto |
|---|---|---|
| Cumplimiento de ingresos | Ingresos reales ÷ planificados | ≥ 100 % − tolerancia |
| Ejecución del presupuesto de gastos | Gastos reales ÷ presupuestados | ≤ 100 % |
| Desviación de gastos | Gastos reales − presupuestados | ≤ 0 |
| Tasa de ahorro real | (Ingresos − gastos) ÷ ingresos | ≥ meta configurada (20 %) |
| Cumplimiento del ahorro programado | Aportes reales ÷ aportes programados | ≥ 100 % |
| Peso de gastos fijos | Gastos fijos ÷ ingresos | ≤ 50 % |
| Gasto discrecional | Gastos "deseo" ÷ ingresos | ≤ 30 % |
| Meses dentro del presupuesto | Meses con gasto ≤ plan ÷ meses con registros | ≥ 80 % |
| Precisión de la planificación | 1 − error porcentual absoluto medio por categoría | ≥ 85 % |
| Cobertura del fondo de emergencia | Fondo ÷ gasto mensual promedio | ≥ 6 meses |
| Variación mensual del gasto | Gasto del mes vs. mes anterior | ≤ +5 % |
| Proyección de saldo al cierre | Saldo real acumulado + saldo planificado restante | ≥ plan anual |

Semáforo: **verde** en meta, **naranja** alerta (dentro de la tolerancia), **rojo** crítico.

## Cómo empezar

1. Abre `index.html` y, si quieres explorar, pulsa **Cargar datos de ejemplo** (ene–sep 2027 simulados).
2. Ajusta tus categorías y moneda en **Configuración**.
3. Programa tus montos mensuales en **Planificación**.
4. Registra cada movimiento real en **Movimientos** (o desde el detalle de un mes).
5. Revisa **KPI y optimización** para ver desviaciones y recomendaciones.

## Estructura

```
index.html        Página principal
css/styles.css    Estilos (modo claro/oscuro, adaptable a móvil)
js/data.js        Modelo de datos, persistencia, datos de ejemplo y agregaciones
js/charts.js      Gráficos SVG sin dependencias
js/kpi.js         Cálculo de KPI y recomendaciones
js/app.js         Interfaz y acciones
```
