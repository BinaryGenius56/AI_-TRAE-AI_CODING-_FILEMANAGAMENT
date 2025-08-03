import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Box,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCodeScanner as ScannerIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { format } from 'date-fns';

// Mock API service - would be replaced with actual API calls
const medicationService = {
  getPatientMedications: async (patientId) => {
    // Simulate API call
    return [
      {
        id: '1',
        name: 'Lisinopril',
        rxnormCode: 'RX123456',
        dosage: '10mg',
        frequency: 'Once daily',
        route: 'oral',
        startDate: new Date(2023, 0, 15),
        endDate: new Date(2023, 6, 15),
        prescribedBy: 'Dr. Smith',
        active: true,
      },
      {
        id: '2',
        name: 'Metformin',
        rxnormCode: 'RX789012',
        dosage: '500mg',
        frequency: 'Twice daily',
        route: 'oral',
        startDate: new Date(2023, 1, 10),
        endDate: null,
        prescribedBy: 'Dr. Johnson',
        active: true,
      },
      {
        id: '3',
        name: 'Atorvastatin',
        rxnormCode: 'RX345678',
        dosage: '20mg',
        frequency: 'Once daily at bedtime',
        route: 'oral',
        startDate: new Date(2022, 11, 5),
        endDate: null,
        prescribedBy: 'Dr. Smith',
        active: true,
      },
    ];
  },
  searchMedications: async (query) => {
    // Simulate API call for medication search
    return [
      { id: '101', name: 'Lisinopril', rxnormCode: 'RX123456', form: 'tablet', strength: '10mg' },
      { id: '102', name: 'Lisinopril', rxnormCode: 'RX123457', form: 'tablet', strength: '20mg' },
      { id: '103', name: 'Metformin', rxnormCode: 'RX789012', form: 'tablet', strength: '500mg' },
      { id: '104', name: 'Metformin', rxnormCode: 'RX789013', form: 'tablet', strength: '1000mg' },
      { id: '105', name: 'Atorvastatin', rxnormCode: 'RX345678', form: 'tablet', strength: '20mg' },
    ].filter(med => med.name.toLowerCase().includes(query.toLowerCase()));
  },
  scanBarcode: async (barcode) => {
    // Simulate barcode scanning
    const medications = {
      '00123456789012': { id: '101', name: 'Lisinopril', rxnormCode: 'RX123456', form: 'tablet', strength: '10mg' },
      '00123456789013': { id: '103', name: 'Metformin', rxnormCode: 'RX789012', form: 'tablet', strength: '500mg' },
    };
    return medications[barcode] || null;
  },
  addMedication: async (patientId, medication) => {
    // Simulate API call to add medication
    console.log('Adding medication for patient', patientId, medication);
    return { ...medication, id: Math.random().toString(36).substr(2, 9) };
  },
  updateMedication: async (patientId, medicationId, medication) => {
    // Simulate API call to update medication
    console.log('Updating medication', medicationId, 'for patient', patientId, medication);
    return { ...medication, id: medicationId };
  },
  deleteMedication: async (patientId, medicationId) => {
    // Simulate API call to delete medication
    console.log('Deleting medication', medicationId, 'for patient', patientId);
    return true;
  },
};

const MedicationManagement = ({ patientId, patientName }) => {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
  const [currentMedication, setCurrentMedication] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [filterActive, setFilterActive] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    rxnormCode: '',
    dosage: '',
    frequency: '',
    route: 'oral',
    startDate: new Date(),
    endDate: null,
    prescribedBy: '',
    active: true,
  });

  useEffect(() => {
    loadMedications();
  }, [patientId, filterActive]);

  const loadMedications = async () => {
    try {
      setLoading(true);
      const data = await medicationService.getPatientMedications(patientId);
      setMedications(filterActive ? data.filter(med => med.active) : data);
      setError(null);
    } catch (err) {
      setError('Failed to load medications');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setFormData({
      name: '',
      rxnormCode: '',
      dosage: '',
      frequency: '',
      route: 'oral',
      startDate: new Date(),
      endDate: null,
      prescribedBy: '',
      active: true,
    });
    setSearchResults([]);
    setSearchQuery('');
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (medication) => {
    setDialogMode('edit');
    setCurrentMedication(medication);
    setFormData({
      name: medication.name,
      rxnormCode: medication.rxnormCode,
      dosage: medication.dosage,
      frequency: medication.frequency,
      route: medication.route,
      startDate: medication.startDate,
      endDate: medication.endDate,
      prescribedBy: medication.prescribedBy,
      active: medication.active,
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentMedication(null);
    setSearchResults([]);
    setSearchQuery('');
    setShowScanner(false);
    setScannedBarcode('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleDateChange = (name, date) => {
    setFormData({
      ...formData,
      [name]: date,
    });
  };

  const handleSearchMedication = async () => {
    if (searchQuery.trim() === '') return;
    
    try {
      const results = await medicationService.searchMedications(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching medications:', err);
      setSnackbarMessage('Failed to search medications');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };

  const handleSelectMedication = (medication) => {
    setFormData({
      ...formData,
      name: medication.name,
      rxnormCode: medication.rxnormCode,
      dosage: medication.strength,
    });
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleScanBarcode = async () => {
    // In a real app, this would activate a camera or scanner
    // For this demo, we'll simulate scanning with a text input
    setShowScanner(true);
  };

  const handleBarcodeInputChange = (e) => {
    setScannedBarcode(e.target.value);
  };

  const handleProcessBarcode = async () => {
    if (scannedBarcode.trim() === '') return;
    
    try {
      const medication = await medicationService.scanBarcode(scannedBarcode);
      if (medication) {
        setFormData({
          ...formData,
          name: medication.name,
          rxnormCode: medication.rxnormCode,
          dosage: medication.strength,
        });
        setSnackbarMessage('Medication found from barcode');
        setSnackbarSeverity('success');
      } else {
        setSnackbarMessage('No medication found for this barcode');
        setSnackbarSeverity('warning');
      }
      setShowSnackbar(true);
      setShowScanner(false);
      setScannedBarcode('');
    } catch (err) {
      console.error('Error processing barcode:', err);
      setSnackbarMessage('Failed to process barcode');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'add') {
        const newMedication = await medicationService.addMedication(patientId, formData);
        setMedications([...medications, newMedication]);
        setSnackbarMessage('Medication added successfully');
      } else {
        const updatedMedication = await medicationService.updateMedication(
          patientId,
          currentMedication.id,
          formData
        );
        setMedications(
          medications.map((med) =>
            med.id === currentMedication.id ? updatedMedication : med
          )
        );
        setSnackbarMessage('Medication updated successfully');
      }
      setSnackbarSeverity('success');
      setShowSnackbar(true);
      handleCloseDialog();
    } catch (err) {
      console.error('Error saving medication:', err);
      setSnackbarMessage('Failed to save medication');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };

  const handleDelete = async (medicationId) => {
    if (window.confirm('Are you sure you want to delete this medication?')) {
      try {
        await medicationService.deleteMedication(patientId, medicationId);
        setMedications(medications.filter((med) => med.id !== medicationId));
        setSnackbarMessage('Medication deleted successfully');
        setSnackbarSeverity('success');
        setShowSnackbar(true);
      } catch (err) {
        console.error('Error deleting medication:', err);
        setSnackbarMessage('Failed to delete medication');
        setSnackbarSeverity('error');
        setShowSnackbar(true);
      }
    }
  };

  const handleCloseSnackbar = () => {
    setShowSnackbar(false);
  };

  const toggleFilter = () => {
    setFilterActive(!filterActive);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Medication Management
        </Typography>
        <Typography variant="h6" color="textSecondary">
          Patient: {patientName}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenAddDialog}
        >
          Add Medication
        </Button>
        <Button
          variant="outlined"
          startIcon={<FilterIcon />}
          onClick={toggleFilter}
        >
          {filterActive ? 'Show All' : 'Show Active Only'}
        </Button>
      </Box>

      {loading ? (
        <Typography>Loading medications...</Typography>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Medication</TableCell>
                <TableCell>Dosage</TableCell>
                <TableCell>Frequency</TableCell>
                <TableCell>Route</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Prescribed By</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {medications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    No medications found
                  </TableCell>
                </TableRow>
              ) : (
                medications.map((medication) => (
                  <TableRow key={medication.id}>
                    <TableCell>
                      <Typography variant="body1">{medication.name}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {medication.rxnormCode}
                      </Typography>
                    </TableCell>
                    <TableCell>{medication.dosage}</TableCell>
                    <TableCell>{medication.frequency}</TableCell>
                    <TableCell>{medication.route}</TableCell>
                    <TableCell>
                      {format(new Date(medication.startDate), 'MM/dd/yyyy')}
                    </TableCell>
                    <TableCell>
                      {medication.endDate
                        ? format(new Date(medication.endDate), 'MM/dd/yyyy')
                        : 'Ongoing'}
                    </TableCell>
                    <TableCell>{medication.prescribedBy}</TableCell>
                    <TableCell>
                      <Chip
                        label={medication.active ? 'Active' : 'Inactive'}
                        color={medication.active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenEditDialog(medication)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(medication.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Medication Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Add New Medication' : 'Edit Medication'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            {dialogMode === 'add' && (
              <Box sx={{ display: 'flex', mb: 2 }}>
                <TextField
                  label="Search Medication"
                  variant="outlined"
                  fullWidth
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ mr: 1 }}
                />
                <Button
                  variant="contained"
                  startIcon={<SearchIcon />}
                  onClick={handleSearchMedication}
                >
                  Search
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ScannerIcon />}
                  onClick={handleScanBarcode}
                  sx={{ ml: 1 }}
                >
                  Scan
                </Button>
              </Box>
            )}

            {showScanner && (
              <Box sx={{ display: 'flex', mb: 2, alignItems: 'center' }}>
                <TextField
                  label="Scan or Enter Barcode"
                  variant="outlined"
                  fullWidth
                  value={scannedBarcode}
                  onChange={handleBarcodeInputChange}
                  sx={{ mr: 1 }}
                />
                <Button
                  variant="contained"
                  onClick={handleProcessBarcode}
                >
                  Process
                </Button>
              </Box>
            )}

            {searchResults.length > 0 && (
              <Paper sx={{ mb: 2, p: 1, maxHeight: 200, overflow: 'auto' }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Search Results:
                </Typography>
                {searchResults.map((med) => (
                  <Box
                    key={med.id}
                    sx={{
                      p: 1,
                      mb: 0.5,
                      border: '1px solid #eee',
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#f5f5f5' },
                    }}
                    onClick={() => handleSelectMedication(med)}
                  >
                    <Typography variant="body2">
                      {med.name} {med.strength} ({med.form})
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {med.rxnormCode}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Medication Name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                fullWidth
                required
                margin="normal"
              />
              <TextField
                label="RxNorm Code"
                name="rxnormCode"
                value={formData.rxnormCode}
                onChange={handleInputChange}
                fullWidth
                margin="normal"
              />
              <TextField
                label="Dosage"
                name="dosage"
                value={formData.dosage}
                onChange={handleInputChange}
                fullWidth
                required
                margin="normal"
              />
              <TextField
                label="Frequency"
                name="frequency"
                value={formData.frequency}
                onChange={handleInputChange}
                fullWidth
                required
                margin="normal"
                placeholder="e.g., Once daily, Twice daily"
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Route</InputLabel>
                <Select
                  name="route"
                  value={formData.route}
                  onChange={handleInputChange}
                  label="Route"
                >
                  <MenuItem value="oral">Oral</MenuItem>
                  <MenuItem value="intravenous">Intravenous</MenuItem>
                  <MenuItem value="intramuscular">Intramuscular</MenuItem>
                  <MenuItem value="subcutaneous">Subcutaneous</MenuItem>
                  <MenuItem value="topical">Topical</MenuItem>
                  <MenuItem value="inhalation">Inhalation</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Prescribed By"
                name="prescribedBy"
                value={formData.prescribedBy}
                onChange={handleInputChange}
                fullWidth
                required
                margin="normal"
              />
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Start Date"
                  value={formData.startDate}
                  onChange={(date) => handleDateChange('startDate', date)}
                  renderInput={(params) => <TextField {...params} fullWidth margin="normal" />}
                />
                <DatePicker
                  label="End Date (leave empty if ongoing)"
                  value={formData.endDate}
                  onChange={(date) => handleDateChange('endDate', date)}
                  renderInput={(params) => <TextField {...params} fullWidth margin="normal" />}
                />
              </LocalizationProvider>
              <FormControl fullWidth margin="normal">
                <InputLabel>Status</InputLabel>
                <Select
                  name="active"
                  value={formData.active}
                  onChange={handleInputChange}
                  label="Status"
                >
                  <MenuItem value={true}>Active</MenuItem>
                  <MenuItem value={false}>Inactive</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {dialogMode === 'add' ? 'Add Medication' : 'Update Medication'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default MedicationManagement;