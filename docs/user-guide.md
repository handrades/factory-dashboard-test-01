# Factory Dashboard User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Production Lines](#production-lines)
4. [Equipment Monitoring](#equipment-monitoring)
5. [Alarms and Alerts](#alarms-and-alerts)
6. [Data Analysis](#data-analysis)
7. [Troubleshooting](#troubleshooting)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [FAQ](#faq)

## Getting Started

### Accessing the Dashboard

1. **Open your web browser** and navigate to the Factory Dashboard URL
   - Default URL: `http://localhost:3000`
   - Production URL: `https://your-factory-dashboard.com`

2. **System Requirements**
   - Modern web browser (Chrome, Firefox, Safari, Edge)
   - JavaScript enabled
   - Screen resolution: 1920x1080 recommended (minimum 1366x768)

3. **Login** (if authentication is enabled)
   - Enter your username and password
   - Click "Login" or press Enter

### Initial Setup

When you first access the dashboard, you'll see:
- **Connection Status**: Indicates if the system is receiving data
- **Production Lines**: Overview of all configured production lines
- **Equipment Status**: Current status of all equipment
- **Recent Alarms**: Latest system alerts

## Dashboard Overview

### Main Interface

The dashboard consists of several key areas:

```
┌─────────────────────────────────────────────────────────────┐
│  Factory Dashboard                    [Connection Status]   │
├─────────────────────────────────────────────────────────────┤
│  [Line 1] [Line 2] [Line 3] [Line 4] [Line 5] [Line 6]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Equipment Layout                                           │
│                                                             │
│  [Oven] → [Conveyor] → [Press] → [Assembly] → [Packaging]  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Status Panel          │  Alarms Panel                     │
│  • Line Status         │  • Active Alarms                  │
│  • Equipment Count     │  • Recent Events                  │
│  • Production Rate     │  • Acknowledgments                │
└─────────────────────────────────────────────────────────────┘
```

### Navigation

- **Production Line Tabs**: Click to switch between different production lines
- **Equipment Cards**: Click on any equipment to view detailed information
- **Status Indicators**: Color-coded indicators show equipment status
- **Refresh Button**: Manually refresh data if needed

### Status Indicators

Equipment status is indicated by color coding:
- 🟢 **Green**: Normal operation
- 🟡 **Yellow**: Warning condition
- 🔴 **Red**: Alarm condition
- ⚫ **Gray**: Offline or no data

## Production Lines

### Line Overview

Each production line tab shows:
- **Line Name**: Descriptive name for the production line
- **Equipment Count**: Total number of equipment on the line
- **Active Equipment**: Number of equipment currently running
- **Production Rate**: Current production throughput
- **Efficiency**: Overall line efficiency percentage

### Line Details

Click on a production line tab to view:
- **Equipment Layout**: Visual representation of equipment positions
- **Flow Diagram**: Process flow with material movement
- **Key Performance Indicators**: Real-time metrics
- **Line History**: Recent production data

### Switching Between Lines

- **Click on line tabs** at the top of the dashboard
- **Use keyboard shortcuts**: Ctrl+1, Ctrl+2, etc.
- **Navigation arrows**: Use left/right arrows to navigate between lines

## Equipment Monitoring

### Equipment Cards

Each equipment is represented by a card showing:
- **Equipment Name**: Descriptive name
- **Status Indicator**: Current operational status
- **Key Metrics**: Important measurements (temperature, pressure, etc.)
- **Last Update**: Timestamp of last data update

### Equipment Details

Click on an equipment card to view detailed information:

#### Industrial Oven
- **Temperature**: Current temperature with target range
- **Heating Status**: On/Off status of heating elements
- **Door Status**: Open/Closed status
- **Energy Consumption**: Power usage
- **Cycle Count**: Number of completed cycles

#### Conveyor Belt
- **Speed**: Current belt speed
- **Motor Status**: Running/Stopped
- **Belt Tension**: Mechanical tension measurement
- **Items Processed**: Count of items passed through
- **Direction**: Forward/Reverse/Stopped

#### Press Machine
- **Pressure**: Hydraulic pressure level
- **Position**: Ram position
- **Cycle Count**: Number of press cycles
- **Force Applied**: Current force measurement
- **Safety Status**: Safety system status

#### Assembly Station
- **Station Status**: Individual station active/inactive
- **Cycle Time**: Time per assembly cycle
- **Quality Score**: Quality metrics
- **Parts Count**: Number of parts assembled

### Real-time Data

The dashboard updates equipment data in real-time:
- **Update Frequency**: Every 2-5 seconds
- **Data Source**: PLC systems via message queue
- **Connection Status**: Shown in top-right corner
- **Timestamp**: Last update time shown on each equipment card

### Historical Data

Access historical data by:
1. **Click on equipment card** to open details
2. **Select time range** from dropdown menu
3. **Choose metrics** to display
4. **View trends** in chart format

## Alarms and Alerts

### Alarm Types

The system monitors for various alarm conditions:

#### High Priority Alarms
- **Temperature Exceeded**: Equipment temperature above safe limits
- **Pressure High**: Hydraulic pressure exceeded maximum
- **Safety System**: Safety interlock activated
- **Equipment Failure**: Critical equipment malfunction

#### Medium Priority Alarms
- **Maintenance Due**: Scheduled maintenance required
- **Efficiency Low**: Production efficiency below target
- **Quality Issue**: Product quality below specifications
- **Communication Loss**: Lost connection to equipment

#### Low Priority Alarms
- **Calibration Due**: Sensor calibration required
- **Filter Replacement**: Filter needs replacement
- **Consumables Low**: Consumables need replenishment

### Alarm Display

Alarms are displayed in the alarm panel:
- **Alarm List**: Current active alarms
- **Timestamp**: When alarm occurred
- **Equipment**: Which equipment triggered the alarm
- **Description**: Detailed alarm description
- **Priority**: Alarm severity level

### Alarm Actions

For each alarm, you can:
- **Acknowledge**: Confirm you've seen the alarm
- **View Details**: Get more information about the alarm
- **Take Action**: Access recommended actions
- **Comment**: Add notes about the alarm

### Alarm Acknowledgment

To acknowledge an alarm:
1. **Click on the alarm** in the alarm panel
2. **Click "Acknowledge"** button
3. **Add comment** (optional)
4. **Click "Confirm"**

Acknowledged alarms remain visible but change color to indicate they've been seen.

## Data Analysis

### Key Performance Indicators (KPIs)

The dashboard displays important KPIs:

#### Production Metrics
- **Production Rate**: Items per hour
- **Efficiency**: Overall equipment effectiveness
- **Uptime**: Percentage of time equipment is running
- **Quality Rate**: Percentage of good products

#### Equipment Metrics
- **Cycle Time**: Time per production cycle
- **Throughput**: Items processed per unit time
- **Utilization**: Equipment usage percentage
- **Maintenance Hours**: Time spent on maintenance

#### System Metrics
- **Data Latency**: Time from sensor to dashboard
- **Message Rate**: Messages processed per second
- **System Uptime**: Dashboard availability
- **Error Rate**: System error percentage

### Trend Analysis

View trends by:
1. **Select time range**: Hour, day, week, month
2. **Choose metrics**: Pick KPIs to analyze
3. **Compare periods**: Compare current vs. previous
4. **Export data**: Download data for further analysis

### Reports

Generate reports for:
- **Production Summary**: Daily/weekly/monthly production
- **Equipment Performance**: Equipment-specific metrics
- **Alarm History**: Alarm trends and patterns
- **Maintenance Records**: Maintenance activities

## Troubleshooting

### Common Issues

#### Dashboard Not Loading
1. **Check internet connection**
2. **Verify URL is correct**
3. **Clear browser cache**
4. **Try different browser**
5. **Contact IT support**

#### Data Not Updating
1. **Check connection status** indicator
2. **Refresh the page** (F5 or Ctrl+R)
3. **Check equipment power status**
4. **Verify network connectivity**
5. **Contact system administrator**

#### Equipment Showing Offline
1. **Check equipment power**
2. **Verify network cables**
3. **Check PLC status**
4. **Restart equipment if safe**
5. **Contact maintenance**

#### Alarms Not Clearing
1. **Check alarm acknowledgment**
2. **Verify issue is resolved**
3. **Check alarm configuration**
4. **Restart affected equipment**
5. **Contact support**

### Browser Issues

#### Slow Performance
- **Close other browser tabs**
- **Clear browser cache**
- **Update browser to latest version**
- **Check system resources**

#### Display Issues
- **Adjust screen resolution**
- **Zoom to 100% (Ctrl+0)**
- **Use supported browser**
- **Check display settings**

### Getting Help

If you encounter issues:
1. **Check this user guide** for solutions
2. **Contact your supervisor** for operational questions
3. **Contact IT support** for technical issues
4. **Report bugs** to the development team

## Keyboard Shortcuts

### Navigation
- **Ctrl+1, Ctrl+2, etc.**: Switch between production lines
- **Tab**: Navigate between interface elements
- **Enter**: Activate selected element
- **Escape**: Close dialog boxes

### Data Refresh
- **F5**: Refresh entire page
- **Ctrl+R**: Refresh data
- **Ctrl+F5**: Hard refresh (clear cache)

### Zoom and Display
- **Ctrl+Plus**: Zoom in
- **Ctrl+Minus**: Zoom out
- **Ctrl+0**: Reset zoom to 100%
- **F11**: Toggle fullscreen mode

### Alarms
- **Ctrl+A**: View all alarms
- **Ctrl+Shift+A**: Acknowledge all alarms
- **Delete**: Acknowledge selected alarm

## FAQ

### General Questions

**Q: How often does the dashboard update?**
A: The dashboard updates every 2-5 seconds with real-time data from the PLC systems.

**Q: Can I use the dashboard on mobile devices?**
A: The dashboard is optimized for desktop use but works on tablets. Mobile phone use is not recommended due to screen size limitations.

**Q: What browsers are supported?**
A: Chrome, Firefox, Safari, and Edge are officially supported. Internet Explorer is not supported.

**Q: How do I print dashboard information?**
A: Use your browser's print function (Ctrl+P) or generate a report for printing.

### Technical Questions

**Q: Why is some equipment showing as offline?**
A: Equipment may appear offline due to network issues, PLC problems, or equipment being powered down. Check physical connections and power status.

**Q: How accurate is the real-time data?**
A: Data is typically 2-5 seconds old from the actual sensor readings, depending on network latency and processing time.

**Q: Can I export data for analysis?**
A: Yes, data can be exported in various formats through the reports section.

**Q: What should I do if I see conflicting information?**
A: Verify the information directly at the equipment and report any discrepancies to the system administrator.

### Operational Questions

**Q: Who should I contact for equipment issues?**
A: Contact the maintenance team for equipment problems and IT support for dashboard issues.

**Q: How do I know if an alarm is urgent?**
A: Alarms are color-coded: red for critical, yellow for warning, and white for informational. Critical alarms require immediate attention.

**Q: Can I customize the dashboard layout?**
A: Currently, the layout is fixed, but customization options may be available in future versions.

**Q: How long is data retained?**
A: Real-time data is retained for 7 days, hourly averages for 30 days, and daily summaries for 1 year.

### Training Questions

**Q: Is training available?**
A: Yes, contact your supervisor or HR department for training schedules and materials.

**Q: Are there advanced features I should know about?**
A: This guide covers standard features. Advanced features may be available depending on your access level.

**Q: How do I stay updated on new features?**
A: System updates and new features are communicated through company announcements and updated documentation.

## Support Information

### Contact Information

- **IT Help Desk**: [Phone] | [Email]
- **System Administrator**: [Phone] | [Email]
- **Maintenance Team**: [Phone] | [Email]
- **Training Department**: [Phone] | [Email]

### Emergency Contacts

- **Emergency Response**: [Phone]
- **Safety Officer**: [Phone]
- **Plant Manager**: [Phone]

### Additional Resources

- **Technical Documentation**: [Link]
- **Training Materials**: [Link]
- **System Status Page**: [Link]
- **Feedback Form**: [Link]

### Version Information

- **User Guide Version**: 1.0
- **Last Updated**: [Date]
- **Dashboard Version**: [Version]
- **System Requirements**: [Requirements]

---

*This user guide is updated regularly. For the latest version, check the system documentation or contact your administrator.*