import 'sanitize.css';
import m from 'mithril';
import Chart from 'chart.js';
import styles from './home.css';

const API_URL = 'http://10.0.1.14:8000/';
const UPDATE_INTERVAL = 1;

let state = 'error';
let stateText = 'NO CONNECTION';
let currentTemp = 0;
let chart;
let preheatValue = 40;
let tempOK = true;
const labels = [];
for (let i = 0; i < 200; i += 1) {
  labels.push(`${i * UPDATE_INTERVAL}s`);
}

const pidChanged = [false, false, false];

function getStateText(res) {
  if (res.state === 'standby') {
    return 'STANDBY';
  }

  if (res.state === 'running') {
    return `RUNNING PROFILE: ${res.profile}`;
  }

  if (res.state === 'preheat') {
    return 'PREHEAT';
  }

  return 'NO CONNECTION';
}

fetch(`${API_URL}pid`)
  .then((r) => r.json())
  .then(({ p, i, d }) => {
    document.getElementById('pid_p').value = p;
    document.getElementById('pid_i').value = i;
    document.getElementById('pid_d').value = d;
  });

function updateChart(temp, target, p, i, d) {
  if (!chart) return;
  chart.data.datasets[0].data = target;
  chart.data.datasets[1].data = temp;
  chart.data.datasets[2].data = p;
  chart.data.datasets[3].data = i;
  chart.data.datasets[4].data = d;
  chart.update();
}

setInterval(() => {
  if (state === 'error') {
    Promise.all([
      fetch(`${API_URL}temp`)
        .then((r) => r.json())
        .then((d) => d.temp),
      fetch(`${API_URL}state`)
        .then((r) => r.json()),
    ])
      .then(([temp, res]) => {
        currentTemp = temp;
        stateText = getStateText(res);
        state = res.state;
        m.redraw();
      })
      .catch(() => {
        state = 'error';
        stateText = 'NO CONNECTION';
        m.redraw();
      });
  } else if (state === 'standby' || state === 'running' || state === 'preheat') {
    Promise.all([
      fetch(`${API_URL}temp`)
        .then((r) => r.json())
        .then((d) => d.temp),
      fetch(`${API_URL}data`)
        .then((r) => r.json()),
      fetch(`${API_URL}state`)
        .then((r) => r.json()),
    ])
      .then(([temp, data, res]) => {
        updateChart(data.temp, data.target, data.p, data.i, data.d);
        currentTemp = temp;
        tempOK = Math.abs(temp - (data.target[data.target.length - 1] || 24)) < 5;
        stateText = getStateText(res);
        state = res.state;
        m.redraw();
      })
      .catch(() => {
        state = 'error';
        stateText = 'NO CONNECTION';
        m.redraw();
      });
  }
}, 1000);

const index = {
  oncreate() {
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Target temperature',
          borderColor: 'rgb(255, 210, 63)',
          data: [],
        }, {
          label: 'Actual temperature',
          borderColor: 'rgb(251, 97, 7)',
          data: [],
        }, {
          label: 'P term',
          borderColor: 'rgb(95, 187, 151)',
          data: [],
        }, {
          label: 'I term',
          borderColor: 'rgb(144, 190, 109)',
          data: [],
        }, {
          label: 'D term',
          borderColor: 'rgb(0, 178, 202)',
          data: [],
        }],

      },
    });
  },
  view() {
    return [
      m('div', { class: styles.status },
        m('span', {
          class: styles.state,
        }, stateText),
        m('span', {
          class: styles.temp,
          style: {
            color: tempOK ? '#000' : '#f00',
          },
        }, `${currentTemp}°C`)),
      m('div', { class: styles.container },
        m('div', { class: styles.chart },
          m('canvas', { id: 'chart', width: '720px', height: '480px' })),
        m('div', { class: styles.buttons },
          m('input', {
            type: 'number',
            class: styles.adjustInput,
            value: preheatValue,
            id: 'preheat',
            oninput(e) {
              preheatValue = parseFloat(e.target.value);
            },
          }),
          m('button', {
            onclick() {
              fetch(`${API_URL}preheat`, {
                method: 'post',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ temp: preheatValue }),
              });
            },
          }, 'Preheat'),
          m('button', {
            disabled: state !== 'preheat',
            onclick() {
              m.request(`${API_URL}run`, { method: 'post' });
            },
          }, 'Begin profile'),
          m('button', {
            class: styles.estop,
            onclick() {
              m.request(`${API_URL}stop`, { method: 'post' });
            },
          }, 'STOP')),
        m('div', { class: styles.adjust },
          m('span', { class: styles.adjustLabel }, 'P:'),
          m('input', {
            class: styles.adjustInput,
            type: 'number',
            id: 'pid_p',
            style: {
              color: pidChanged[0] ? '#f00' : undefined,
            },
            oninput() {
              pidChanged[0] = true;
            },
          }),
          m('span', { class: styles.adjustLabel }, 'I:'),
          m('input', {
            class: styles.adjustInput,
            type: 'number',
            id: 'pid_i',
            style: {
              color: pidChanged[1] ? '#f00' : undefined,
            },
            oninput() {
              pidChanged[1] = true;
            },
          }),
          m('span', { class: styles.adjustLabel }, 'D:'),
          m('input', {
            class: styles.adjustInput,
            type: 'number',
            id: 'pid_d',
            style: {
              color: pidChanged[2] ? '#f00' : undefined,
            },
            oninput() {
              pidChanged[2] = true;
            },
          }),
          m('button', {
            class: styles.applyButton,
            disabled: !pidChanged[0] && !pidChanged[1] && !pidChanged[2],
            onclick() {
              fetch(`${API_URL}pid_set`, {
                method: 'post',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  p: parseFloat(document.getElementById('pid_p').value),
                  i: parseFloat(document.getElementById('pid_i').value),
                  d: parseFloat(document.getElementById('pid_d').value),
                }),
              })
                .then(() => {
                  pidChanged[0] = false;
                  pidChanged[1] = false;
                  pidChanged[2] = false;
                  m.redraw();
                });
            },
          }, 'Apply'))),
    ];
  },
};

m.route(document.body, '/', {
  '/': index,
});
