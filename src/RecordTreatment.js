import wixData from 'wix-data';
import wixUsers from 'wix-users';

$w.onReady(() => {
  $w('#statusText').hide();


});

$w('#saveButton').onClick(async () => {
	$w('#statusText').hide();

	const record = [];

	// Parse & validate the common date/time
	const date = $w('#treatmentDate').value;
	const time = $w('#treatmentTime').value;
	const userId = wixUsers.currentUser.id;

	const bg = $w('#readingValue').value

	// — Carbs
	const carbs = $w('#carbs').value;
	const fat = $w('#fat').value;
	const protein = $w('#protein').value;

	// — Insulin
	const bolus = $w('#bolus').value;
	const insulinType = $w('#insulinType').value;


	// — Exercise
	if (bolus === '' && carbs === '' && fat === '' && protein === '' && bolus === '') {
		$w('#statusText').text = 'Enter at least one value to save.';
		return $w('#statusText').show();
	}

	record.push({
		userId: userId,
		bgValue: bg,
		dateString: date,
		timestamp: time,
		carbs: carbs,
		fat: fat,
		protein: protein,
		bolus: bolus,
		insulinType
	});


try {
	await Promise.all(
		record.map(rec => wixData.insert('BGData', rec))
	);
	$w('#statusText').text = `Saved Successfully! ✅`;
} catch (err) {
	console.error(err);
	$w('#statusText').text = 'Error saving some items.';
}

$w('#statusText').show();
});
