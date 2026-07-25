function applyCourseCleaner(enabled) {
  const root = document.documentElement;
  root.classList.toggle('semantic-student-clean', Boolean(enabled));
  if (document.getElementById('semantic-student-cleaner-style')) return;

  const style = document.createElement('style');
  style.id = 'semantic-student-cleaner-style';
  style.textContent = `
    html.semantic-student-clean iframe,
    html.semantic-student-clean [class*="ads"],
    html.semantic-student-clean [id*="ads"],
    html.semantic-student-clean [class*="advert"],
    html.semantic-student-clean [id*="advert"],
    html.semantic-student-clean [role="banner"],
    html.semantic-student-clean footer,
    html.semantic-student-clean nav:not([aria-label*="content" i]) {
      opacity: .14 !important;
      filter: grayscale(1) !important;
    }
    html.semantic-student-clean article,
    html.semantic-student-clean main,
    html.semantic-student-clean p,
    html.semantic-student-clean section {
      scroll-margin: 96px !important;
    }
    html.semantic-student-clean .semantic-course-zone {
      outline: 1px solid rgba(116,246,199,.35) !important;
      border-radius: 14px !important;
      background: rgba(116,246,199,.035) !important;
    }
  `;
  document.head.appendChild(style);
}

function markCourseZone(element) {
  document.querySelectorAll('.semantic-course-zone').forEach((node) => node.classList.remove('semantic-course-zone'));
  if (element) element.classList.add('semantic-course-zone');
}

module.exports = { applyCourseCleaner, markCourseZone };
