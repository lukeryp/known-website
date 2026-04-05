#!/usr/bin/env python3
"""Patch demo.html — all 4 features already implemented in Oakmont Hills version.
Just fix list counts to match spec (5 greet, 4 new members)."""

FILE = '/Users/lukebenoit/Desktop/known-website/demo.html'

with open(FILE, 'r') as f:
    html = f.read()

print("Original size:", len(html))

# Fix greet list: slice(0,6) -> slice(0,5)  [spec says 5 members]
assert 'var greet=MEMBERS.filter(function(m){return m.tier===1}).slice(0,6)' in html, "greet slice not found"
html = html.replace(
    'var greet=MEMBERS.filter(function(m){return m.tier===1}).slice(0,6)',
    'var greet=MEMBERS.filter(function(m){return m.tier===1}).slice(0,5)'
)
print("Fixed: greet list -> 5 members")

# Fix new members list: slice(-5) -> slice(-4)  [spec says 4 members]
assert 'var newM=MEMBERS.slice(-5)' in html, "newM slice not found"
html = html.replace(
    'var newM=MEMBERS.slice(-5)',
    'var newM=MEMBERS.slice(-4)'
)
print("Fixed: new members list -> 4 members")

with open(FILE, 'w') as f:
    f.write(html)

# Verify all 4 required features are present
checks = [
    ('Member notes (drink field)', 'drink:"Gin and tonic'),
    ('Member notes (family field)', 'family:"Husband Richard'),
    ('revealMember notes panel', 'function revealMember(member'),
    ('Tap to continue', 'Tap anywhere to continue'),
    ('Lists view HTML', 'id="viewLists"'),
    ('Lists nav button', "showView('Lists')"),
    ('renderLists function', 'function renderLists()'),
    ('Greet list 5 members', 'slice(0,5)'),
    ('New members 4', 'slice(-4)'),
    ('Quiz tip', "In the full app, your club"),
    ('Notes tip', 'Staff can add personal notes'),
    ('Lists tip', 'Managers assign members'),
    ('Dismiss tip function', 'function dismissTip'),
]

print("\nVerification:")
all_ok = True
for label, needle in checks:
    found = needle in html
    print(f"  {'OK' if found else 'FAIL'}: {label}")
    if not found:
        all_ok = False

print("\nNew size:", len(html))
print("All checks passed!" if all_ok else "SOME CHECKS FAILED")
