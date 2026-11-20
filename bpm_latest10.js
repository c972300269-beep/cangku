// Get latest 10 approving processes with current approver info
const fs = require('fs');

let raw = fs.readFileSync('E:/workbuddy/Claw/.workbuddy/bpm_output/my_applying_requests.json', 'utf8');

// Convert JS Date objects to ISO strings
raw = raw.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (m, y, mo, d, h, mi, s) => {
  // JS months are 0-indexed, so month mo is already correct for Date constructor
  const dt = new Date(parseInt(y), parseInt(mo), parseInt(d), parseInt(h), parseInt(mi), parseInt(s));
  return JSON.stringify(dt.toISOString());
});

const data = JSON.parse(raw);
let tasks = data.children;

// Sort by CreateAt descending (newest first)
tasks.sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));

// Take top 10
const latest10 = tasks.slice(0, 10);

console.log('=== 最新10条审批中的流程 ===\n');
latest10.forEach((t, i) => {
  const children = t.State?.children || [];
  const approvers = children.map(c => `${c.RecipientDisplayName}(${c.RecipientAccount})`).join(', ');
  const steps = children.map(c => c.StepName).join(', ');
  const date = new Date(t.CreateAt).toISOString().split('T')[0];

  console.log(`${i + 1}. [${date}] ${t.SerialNum}`);
  console.log(`   流程: ${t.ProcessName}`);
  console.log(`   描述: ${t.Description}`);
  console.log(`   当前节点: ${steps}`);
  console.log(`   当前审批人: ${approvers}`);
  
  // Flag if it's me
  const isMe = children.some(c => c.RecipientAccount === 'chenjialin3');
  if (isMe) {
    console.log(`   ⚠️ 需要您本人操作！`);
  }
  console.log('');
});
