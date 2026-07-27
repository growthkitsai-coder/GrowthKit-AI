/* Persistent finding checklists shared by full reports and daily briefs. */
(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function plain(value) {
    return String(value == null ? '' : value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function token() {
    var client = window.GKAuth && window.GKAuth.client;
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (result) {
      return result && result.data && result.data.session && result.data.session.access_token;
    }).catch(function () { return null; });
  }

  function api(url, options) {
    return token().then(function (accessToken) {
      var opts = options || {};
      opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
      if (accessToken) opts.headers.authorization = 'Bearer ' + accessToken;
      if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
      return fetch(url, opts).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error(data.error || 'Checklist request failed.');
          return data;
        });
      });
    });
  }

  function founderMailto(company, finding, nextMove) {
    var subject = 'Founder match: ' + company + ' - ' + finding;
    var message = [
      'Hi GrowthKit team,',
      '',
      'I want to speak to a founder who solved this exact problem for ' + company + ':',
      '',
      'Finding: ' + finding,
      'Next move: ' + nextMove,
      '',
      'Please make an introduction if you know the right person.'
    ].join('\n');
    return 'mailto:info@growthkitai.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
  }

  function shell(options) {
    options = options || {};
    var key = plain(options.findingKey);
    var finding = plain(options.finding);
    var nextMove = plain(options.nextMove);
    var company = plain(options.company) || 'my company';
    if (!key || !finding || !nextMove) return '';
    return '<div class="finding-work" data-finding-key="' + esc(key) + '">' +
      '<div class="finding-next"><span>This week</span><strong>' + esc(nextMove) + '</strong></div>' +
      '<div class="finding-checklist">' +
        '<div class="finding-task-head"><span>Checklist</span><span data-finding-progress>0 / 3 done</span></div>' +
        '<div class="finding-task-list" data-finding-task-list><span class="finding-task-state">Loading tasks...</span></div>' +
        '<form class="finding-task-form" data-finding-task-form>' +
          '<input type="text" maxlength="180" required placeholder="Add a task" aria-label="Add a task for ' + esc(finding) + '">' +
          '<button type="submit" title="Add task" aria-label="Add task">+</button>' +
        '</form>' +
        '<div class="finding-task-message" data-finding-task-message role="status" aria-live="polite"></div>' +
      '</div>' +
      '<div class="finding-founder"><strong>Want to talk to a founder who solved this exact problem?</strong>' +
        '<a href="' + esc(founderMailto(company, finding, nextMove)) + '">info@growthkitai.com</a></div>' +
    '</div>';
  }

  function setMessage(node, message) {
    var state = node.querySelector('[data-finding-task-message]');
    if (state) state.textContent = message || '';
  }

  function renderTasks(node, tasks, context) {
    var list = node.querySelector('[data-finding-task-list]');
    var progress = node.querySelector('[data-finding-progress]');
    var form = node.querySelector('[data-finding-task-form]');
    var findingKey = node.getAttribute('data-finding-key');
    if (!list || !form) return;

    function updateProgress() {
      var completed = tasks.filter(function (task) { return task.completed; }).length;
      if (progress) progress.textContent = completed + ' / ' + tasks.length + ' done';
    }

    list.innerHTML = '';
    tasks.forEach(function (task, index) {
      var row = document.createElement('div');
      row.className = 'finding-task' + (task.completed ? ' is-complete' : '');
      var inputId = 'finding-task-' + String(task.id || index).replace(/[^a-z0-9-]/gi, '');
      row.innerHTML = '<input id="' + esc(inputId) + '" type="checkbox"' + (task.completed ? ' checked' : '') + '>' +
        '<label for="' + esc(inputId) + '">' + esc(task.label) + '</label>' +
        (task.origin === 'custom' ? '<button type="button" class="finding-task-delete" title="Delete task" aria-label="Delete ' + esc(task.label) + '">&times;</button>' : '');
      var checkbox = row.querySelector('input');
      checkbox.addEventListener('change', function () {
        var next = checkbox.checked;
        checkbox.disabled = true;
        setMessage(node, 'Saving...');
        api('/api/finding-tasks', { method: 'PATCH', body: { id: task.id, completed: next } }).then(function () {
          task.completed = next;
          row.classList.toggle('is-complete', next);
          updateProgress();
          setMessage(node, 'Saved');
        }).catch(function (error) {
          checkbox.checked = !next;
          setMessage(node, error.message);
        }).finally(function () { checkbox.disabled = false; });
      });
      var remove = row.querySelector('.finding-task-delete');
      if (remove) remove.addEventListener('click', function () {
        remove.disabled = true;
        api('/api/finding-tasks', { method: 'DELETE', body: { id: task.id } }).then(function () {
          tasks = tasks.filter(function (candidate) { return candidate.id !== task.id; });
          renderTasks(node, tasks, context);
        }).catch(function (error) {
          remove.disabled = false;
          setMessage(node, error.message);
        });
      });
      list.appendChild(row);
    });
    updateProgress();

    form.onsubmit = function (event) {
      event.preventDefault();
      var input = form.querySelector('input');
      var label = input && input.value.trim();
      if (!label) return;
      var button = form.querySelector('button');
      button.disabled = true;
      setMessage(node, 'Adding...');
      api('/api/finding-tasks', {
        method: 'POST',
        body: { scope: context.scope, date: context.date || null, report_id: context.reportId || null, finding_key: findingKey, label: label }
      }).then(function (data) {
        tasks.push(data.task);
        input.value = '';
        renderTasks(node, tasks, context);
        setMessage(node, 'Task added');
      }).catch(function (error) {
        setMessage(node, error.message);
      }).finally(function () { button.disabled = false; });
    };
  }

  function hydrate(root, context) {
    if (!root || !context || !context.scope) return Promise.resolve(false);
    var nodes = Array.prototype.slice.call(root.querySelectorAll('[data-finding-key]'));
    if (!nodes.length) return Promise.resolve(false);
    var query = '?scope=' + encodeURIComponent(context.scope);
    if (context.date) query += '&date=' + encodeURIComponent(context.date);
    // Checklist state is per-report, so a history view edits its own report's
    // tasks rather than the newest report's. Omitted → the latest completed one.
    if (context.reportId) query += '&report_id=' + encodeURIComponent(context.reportId);
    return api('/api/finding-tasks' + query, { method: 'GET' }).then(function (data) {
      var rows = data.tasks || [];
      nodes.forEach(function (node) {
        var key = node.getAttribute('data-finding-key');
        renderTasks(node, rows.filter(function (task) { return task.finding_key === key; }), context);
      });
      return true;
    }).catch(function (error) {
      nodes.forEach(function (node) {
        var list = node.querySelector('[data-finding-task-list]');
        var form = node.querySelector('[data-finding-task-form]');
        if (list) list.innerHTML = '<span class="finding-task-state">' + esc(error.message || 'Checklist unavailable.') + '</span>';
        if (form) form.hidden = true;
      });
      return false;
    });
  }

  window.GKFindings = { shell: shell, hydrate: hydrate };
})();
