const canonicalGrades = ['Junior', 'Middle', 'Senior', 'Lead', 'Не указан'];

// A vacancy can belong to several grades, but only once to each grade.
export function gradeLabels(value?: string): string[] {
  const labels = (value || '').split('/').map(part => part.trim()).filter(Boolean)
    .map(part => canonicalGrades.find(grade => grade.toLowerCase() === part.toLowerCase()) || part);
  return labels.length ? [...new Set(labels)] : ['Не указан'];
}
